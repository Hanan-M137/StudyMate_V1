import os

from anthropic import Anthropic
from dotenv import load_dotenv


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# ANTHROPIC CLIENT
# =========================================================

def get_anthropic_client() -> Anthropic:
    """
    Create an Anthropic client using the API key
    stored in the .env file.
    """

    api_key = os.getenv(
        "ANTHROPIC_API_KEY"
    )

    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is missing "
            "from the .env file"
        )

    return Anthropic(
        api_key=api_key
    )