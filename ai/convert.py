"""
Convert Office documents to PDF with LibreOffice.

This module is the only place in the project that knows LibreOffice
exists. Everything else asks it two questions - "is this file type
supported?" and "turn this file into a PDF" - and never learns how the
answer is produced.

That isolation is deliberate. The feature is on trial: if the quality of
the converted documents is not good enough it will be deleted, and
deleting it should mean deleting this file and undoing a short, clearly
marked edit at each of its two callers.
"""

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time

from pathlib import Path


# =========================================================
# LOGGING
# =========================================================

logger = logging.getLogger(__name__)


# =========================================================
# SUPPORTED FILE TYPES
# =========================================================

# The formats LibreOffice can open and re-export as PDF. Kept as a set of
# lowercased extensions because that is the only thing an upload gives us
# to judge by - the browser's MIME type for an Office file is unreliable,
# and a student's file may have travelled through several machines.
CONVERTIBLE_EXTENSIONS = {
    ".docx",
    ".doc",
    ".pptx",
    ".ppt",
    ".xlsx",
    ".xls",
    ".odt",
    ".odp",
    ".ods",
    ".rtf",
}

# PDF is supported without being convertible: it is what the pipeline
# already reads, so it goes straight through untouched.
SUPPORTED_EXTENSIONS = CONVERTIBLE_EXTENSIONS | {".pdf"}


# =========================================================
# FAILURE TYPES
# =========================================================

class ConversionError(Exception):
    """
    Base class, so a caller that does not care why the conversion
    failed can catch one thing.
    """


class SofficeNotFound(ConversionError):
    """
    LibreOffice is not installed, or SOFFICE_CMD points somewhere that
    does not exist.

    Kept separate from ConversionFailed because the two mean opposite
    things to the person running the server: this one is "install
    something", the other is "this particular file did not work".
    """


class ConversionFailed(ConversionError):
    """
    LibreOffice was found and run, but no usable PDF came out of it.
    """


# =========================================================
# FIND LIBREOFFICE
# =========================================================

# Where LibreOffice installs itself when nobody has put it on PATH.
#
# On Windows this is soffice.COM and never soffice.EXE. Measured on this
# machine: the .exe detaches from the console immediately, returns in
# about 18 ms with a success code, and the conversion is still running
# when it does - so every check we make on the result runs too early and
# sees nothing. The .com wrapper stays attached and returns when the work
# is actually finished.
KNOWN_SOFFICE_PATHS = {
    "win32": [
        r"C:\Program Files\LibreOffice\program\soffice.com",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.com",
    ],
    "darwin": [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ],
}


def find_soffice() -> str | None:
    """
    Locate the LibreOffice command, or return None if it is not
    installed.

    Deliberately resolved on every call rather than once at import time.
    Resolving at import would make a missing LibreOffice a startup
    problem for the whole server, when in truth it is a problem for
    exactly one thing: uploading a non-PDF file. PDF uploads must keep
    working on a machine that has never heard of LibreOffice, and a
    LibreOffice installed while the server is running should be picked
    up without a restart.

    Mirrors the TESSERACT_CMD lookup in ai/service.py - an explicit
    environment variable first, then PATH - with the known install
    locations added, because LibreOffice does not put itself on PATH on
    Windows or macOS.
    """

    configured = os.environ.get("SOFFICE_CMD")

    if configured:

        # An explicitly configured path is not second-guessed beyond
        # checking that it is there. If the owner pointed at a specific
        # build, that is the build we use.
        return configured if os.path.exists(configured) else None

    # On Windows, ask for soffice.com by name. A bare "soffice" would let
    # PATHEXT find soffice.exe first, which is the one broken behaviour
    # this whole module is written around.
    executable_name = "soffice.com" if sys.platform == "win32" else "soffice"

    found_on_path = shutil.which(executable_name)

    if found_on_path:
        return found_on_path

    for candidate in KNOWN_SOFFICE_PATHS.get(sys.platform, []):

        if os.path.exists(candidate):
            return candidate

    return None


# =========================================================
# FILE TYPE QUESTIONS
# =========================================================

def _extension(filename: str) -> str:
    """
    The lowercased extension of a filename, including the dot.
    """

    return os.path.splitext(filename)[1].lower()


def is_supported(filename: str) -> bool:
    """
    True if this file can be turned into chunks at all - either because
    it is already a PDF or because LibreOffice can make one out of it.
    """

    return _extension(filename) in SUPPORTED_EXTENSIONS


def needs_conversion(filename: str) -> bool:
    """
    True if this file has to go through LibreOffice before the PDF
    pipeline can read it.

    A PDF answers False here, which is what keeps PDF uploads on exactly
    the path they were on before this feature existed.
    """

    return _extension(filename) in CONVERTIBLE_EXTENSIONS


# =========================================================
# ENVIRONMENT FOR THE SUBPROCESS
# =========================================================

# LibreOffice embeds its own Python. Started from inside an activated
# virtualenv it inherits ours, and in the experiment that produced a
# Python environment warning and unpredictable behaviour - the server
# normally does run from inside a venv, so this is the ordinary case and
# not an edge one.
INHERITED_PYTHON_VARIABLES = (
    "PYTHONHOME",
    "PYTHONPATH",
    "VIRTUAL_ENV",
)


def _sanitized_environment() -> dict:
    """
    A copy of our environment with the variables that confuse
    LibreOffice's own Python removed.
    """

    environment = os.environ.copy()

    for name in INHERITED_PYTHON_VARIABLES:
        environment.pop(name, None)

    return environment


# =========================================================
# CONVERT ONE FILE TO PDF
# =========================================================

# 300 seconds. The conversion rate measured on this machine is roughly
# 2 seconds per megabyte (2.6 MB docx took 5.0 s, 5 MB pptx took 10.6 s),
# and MAX_CONVERT_MB in backend/main.py caps an Office upload at 100 MB,
# so the largest file we accept should finish in around 200 seconds. The
# extra 100 is headroom for a file that converts more slowly than its
# size suggests, not room for a different class of file.
DEFAULT_TIMEOUT_SECONDS = 300


def convert_to_pdf(
    source_path: str,
    output_dir: str,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """
    Convert one Office document to PDF and return the path of the PDF.

    The original file is left exactly where it is. The PDF is written
    into output_dir under the source file's own stem.

    Raises SofficeNotFound if LibreOffice is missing, and
    ConversionFailed on every other failure.
    """

    soffice = find_soffice()

    if not soffice:
        raise SofficeNotFound(
            "LibreOffice was not found. Set SOFFICE_CMD or install it."
        )

    source = Path(source_path)

    if not source.exists():
        raise ConversionFailed(
            f"The file to convert was not found: {source_path}"
        )

    os.makedirs(output_dir, exist_ok=True)

    # LibreOffice names the output after the source stem and nothing
    # else, so this is where it will land - and, because our uploads are
    # already prefixed with a uuid, where no other conversion will land.
    expected_output = Path(output_dir) / f"{source.stem}.pdf"

    # -----------------------------------------------------
    # A private profile directory for this one conversion
    # -----------------------------------------------------
    #
    # Two LibreOffice processes sharing the default user profile do not
    # queue and do not complain: in the experiment one of the two
    # silently produced no file at all and still exited successfully.
    # A throwaway profile per call is what makes two students uploading
    # at the same moment safe.

    profile_dir = tempfile.mkdtemp(prefix="studymate_soffice_")

    profile_url = Path(profile_dir).as_uri()

    command = [
        soffice,
        "--headless",
        "--norestore",
        f"-env:UserInstallation={profile_url}",
        "--convert-to",
        "pdf",
        "--outdir",
        output_dir,
        str(source),
    ]

    started_at = time.monotonic()

    try:

        try:

            result = subprocess.run(
                command,
                capture_output=True,
                timeout=timeout,
                env=_sanitized_environment(),
            )

        except subprocess.TimeoutExpired as expired:

            # subprocess.run has already killed the process and reaped it
            # by the time it raises; there is nothing left to kill here.
            raise ConversionFailed(
                f"The conversion did not finish within {timeout} seconds."
            ) from expired

        elapsed_seconds = time.monotonic() - started_at

        # -------------------------------------------------
        # Judge the result by the file, not by the exit code
        # -------------------------------------------------
        #
        # The experiment produced a zero exit code together with no
        # output file, so the return code is treated as a hint and the
        # file on disk as the truth. A zero-byte PDF is counted as no
        # PDF for the same reason.

        if not expected_output.exists():

            logger.error(
                "LibreOffice produced no PDF for %s "
                "(exit code %s). stderr: %s",
                source.name,
                result.returncode,
                result.stderr.decode(errors="replace").strip(),
            )

            raise ConversionFailed(
                f"No PDF was produced for {source.name}."
            )

        produced_size = expected_output.stat().st_size

        if produced_size == 0:

            expected_output.unlink()

            raise ConversionFailed(
                f"The PDF produced for {source.name} was empty."
            )

        # This log line is how the owner will judge whether the feature
        # is worth keeping, so it records what it cost and what it got.
        logger.info(
            "Converted %s to PDF in %.1f s (%.1f MB in, %.1f MB out).",
            source.name,
            elapsed_seconds,
            source.stat().st_size / (1024 * 1024),
            produced_size / (1024 * 1024),
        )

        return str(expected_output)

    finally:

        # The profile directory is several megabytes and one is created
        # per upload, so it is removed whatever happened above.
        shutil.rmtree(profile_dir, ignore_errors=True)
