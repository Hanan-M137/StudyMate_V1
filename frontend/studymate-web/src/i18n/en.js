/* ==========================================================================
   English - the source text of the interface.

   Every user-visible sentence the frontend writes for itself lives here, and
   nothing else does. Anything that came from the database or the API - a
   document title, a question, a student's own answer, the reasoning Claude
   writes when it grades - is the student's content and is never translated,
   so it never appears in this file. It is interpolated through a {placeholder}
   instead.

   Keys are `area.thing`: the area names a page or a component, the thing
   names the string in it. Two identical English sentences share a key only
   when they say the same thing in the same role - "Save" the button and
   "Saved" the status are two different words in most languages, and a key
   shared between two meanings cannot be translated correctly afterwards.
   ========================================================================== */

export default {
  /* ========================================================================
     common - words that are genuinely the same word everywhere they appear
     ======================================================================== */

  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    rename: 'Rename',
    reload: 'Reload',
    tryAgain: 'Try again',

    /* The spinner's accessible name and the visible label above a skeleton
       list. One word, one role: something is on its way. */
    loading: 'Loading',

    somethingWentWrong: 'Something went wrong',
    backToTop: 'Back to top',

    /* The accessible name of the eye on a password field, and the whole of
       it - the button has no visible text. Two sentences rather than one,
       because the label has to change with the state: a control that still
       says "Show password" while the password is on the screen describes
       the opposite of what pressing it does. */
    showPassword: 'Show password',
    hidePassword: 'Hide password',

    /* The second step of a two-step delete, shared by the quiz row and the
       conversation row: the same question, asked the same way. */
    deleting: 'Deleting...',
    yesDelete: 'Yes, delete',

    /* The marker after a field label, not the adjective. It is always
       rendered in its own span beside the label. */
    optional: '(optional)',
  },

  /* ========================================================================
     errors - what getErrorMessage says when the server said nothing useful

     lib/errors.js holds no sentences at all any more. It decides which of
     these applies and hands the key back; the component translates it.
     ======================================================================== */

  errors: {
    /* The period is the difference from common.somethingWentWrong, and so is
       the role: that one is the heading over an error block, this one is the
       message inside it. */
    generic: 'Something went wrong.',

    sessionExpired: 'Your session has expired. Please sign in again.',
    forbidden: 'You do not have access to this resource.',
    notFound: 'Not found.',
    requestFailed: 'Request failed (HTTP {status}).',
    unreachable: 'Could not reach the API. Is the backend running?',
  },

  /* ========================================================================
     password - the rules, as whole sentences

     One key per combination of broken rules rather than fragments joined
     with commas and "and". English can build the sentence from pieces;
     Arabic coordinates a list differently and would need the whole sentence
     rewritten, not the pieces translated. Seven keys is the price of being
     able to write both correctly.

     The English wording matches validate_password in backend/main.py word
     for word, so the message does not change shape depending on which side
     caught it - and so lib/serverErrors.js can map the server's copy back
     onto these same keys.
     ======================================================================== */

  password: {
    hint: 'At least {min} characters, including a letter and a digit.',

    errLength: 'Password must be at least {min} characters long.',
    errLetter: 'Password must contain at least one letter.',
    errDigit: 'Password must contain at least one digit.',
    errLengthLetter:
      'Password must be at least {min} characters long and contain at least one letter.',
    errLengthDigit:
      'Password must be at least {min} characters long and contain at least one digit.',
    errLetterDigit:
      'Password must contain at least one letter and contain at least one digit.',
    errLengthLetterDigit:
      'Password must be at least {min} characters long, contain at least one letter and contain at least one digit.',
  },

  /* ========================================================================
     server - the backend's own messages, recognised and translated

     The English here is copied from backend/main.py exactly, because that is
     what the match is made against. See lib/serverErrors.js for the mapping
     and for what happens to a message that is not on this list.
     ======================================================================== */

  server: {
    invalidCredentials: 'Invalid email or password',
    emailRegistered: 'Email already registered',
    onlyPdf: 'Only PDF files are supported',
    currentPasswordIncorrect: 'Current password is incorrect',

    numQuestionsMin: 'num_questions must be at least 1',
    numQuestionsMax: 'num_questions cannot exceed 50',
    notEnoughQuestions:
      '{count} question(s) is not enough for {types} question type(s): each type you pick needs at least one question.',

    pageRangeBoth: 'Give both a first and a last page, or neither.',
    firstPageMin: 'The first page must be 1 or greater.',
    lastPageBeforeFirst: 'The last page cannot come before the first page.',
    noSuchPage: 'This document has {pages} pages, so it has no page {page}.',

    /* The four ways an upload can be refused by the server. The two size
       limits are kept apart on purpose: they are different limits for
       different reasons, and a student who hits the lower one needs to be
       told that a PDF of the same size would have been accepted. */
    unsupportedType:
      'Supported file types are PDF, Word, PowerPoint, Excel and OpenDocument.',
    uploadTooLarge: 'This file is larger than the {limit} MB upload limit.',
    convertTooLarge:
      'Office documents are limited to {convertLimit} MB because they have to be converted first. PDF files up to {uploadLimit} MB are accepted.',
    conversionUnavailable:
      'This file type cannot be converted on the server right now. Please upload a PDF instead.',

    /* The contact form's four refusals. The two lengths carry their
       number because the number lives in main.py - MIN_CONTACT_MESSAGE_LENGTH
       and MAX_CONTACT_MESSAGE_LENGTH - and is read back out of the
       message rather than repeated over here where it would go stale
       the first time either constant moved.

       The rate limit names no number at all, because the server's
       sentence does not either: a student who has hit it needs to know
       to wait, not where the line is. */
    contactEmpty: 'Please write a message before sending.',
    contactTooShort: 'A message must be at least {min} characters long.',
    contactTooLong: 'A message cannot be longer than {max} characters.',
    contactRateLimited:
      'You have sent several messages in the last hour. Please wait a while before sending another.',

    /* Email verification's three sentences.

       verificationCodeInvalid is the only thing /auth/verify-email ever
       says - wrong code, expired code, spent code, too many guesses and no
       such account all answer with it. That is the server refusing to tell
       a guesser which of those happened, and the Arabic must not be more
       specific than the English. */
    emailNotVerified:
      'This email address has not been verified yet. Enter the code we sent you, or ask for a new one.',
    verificationCodeInvalid: 'That code is not valid. Ask for a new one and try again.',
    verificationRateLimited:
      'Too many codes have been requested for this account. Please wait a while before asking for another.',
  },

  /* ========================================================================
     nav - the sidebar and the mobile drawer
     ======================================================================== */

  nav: {
    /* Kept apart from the page headings of the same name. A navigation item
       is a signpost and a heading is a title, and a language that shortens
       one will not want the other shortened with it. */
    documents: 'Documents',
    conversations: 'Conversations',
    quizzes: 'Quizzes',

    mainNavigation: 'Main',
    skipToContent: 'Skip to content',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',

    settings: 'Settings',

    /* The entry beside Settings, and the same kind of word: it names
       where the link goes. The page heading below is a different key
       because it is a title rather than a signpost. */
    contact: 'Contact us',

    /* Shown in the user panel when neither a name nor an email has arrived
       yet - it says the session exists, not who it belongs to. */
    signedIn: 'Signed in',
  },

  /* ========================================================================
     auth - sign in, register, and the panel beside them
     ======================================================================== */

  auth: {
    signIn: 'Sign in',

    /* The link from the register page over to the login page. Same two
       words as the submit button above, a different job: one navigates,
       the other submits a form. */
    signInLink: 'Sign in',

    signOut: 'Sign out',

    email: 'Email',
    emailPlaceholder: 'you@university.edu',
    password: 'Password',
    fullName: 'Full name',
    fullNamePlaceholder: 'Hanan Mohammad',

    welcomeBack: 'Welcome back',
    signInSubtitle: 'Sign in with the email and password you registered with.',
    noAccountYet: 'No account yet?',
    createOne: 'Create one',
    couldNotSignIn: 'Could not sign in.',

    createAccount: 'Create account',
    createAccountTitle: 'Create your account',
    createAccountSubtitle: 'Register, then upload your first PDF.',
    alreadyRegistered: 'Already registered?',
    couldNotCreateAccount: 'Could not create the account.',

    /* The verification step - the state the registration page moves into
       when the server answers with a code instead of an account ready to
       use, and the one the sign-in page moves into on a 403.

       Nothing here names a number of minutes. The email says how long the
       code lasts, and repeating it in the interface would be a second place
       for VERIFICATION_CODE_MINUTES to live and go stale. */
    verifyTitle: 'Verify your email',
    verifySubtitle: 'Enter the code we just sent you to finish creating your account.',
    verifyFromSignInSubtitle:
      'This account has not been verified yet. Enter the code to sign in.',

    /* The address itself is not in this sentence - it is rendered beside it
       as its own element. See the note in VerifyEmailPanel.jsx. */
    verifySentTo: 'We sent a six-digit code to:',

    verificationCode: 'Verification code',
    verificationCodeHint: 'Six digits, from the email that has just been sent.',
    verify: 'Verify',

    noCodeYet: 'Did not get it?',
    sendNewCode: 'Send a new code',

    /* Word for word what the server answers, and deliberately so: it
       promises that a code is on its way IF the address needs one, because
       the endpoint answers the same way whether or not the account exists
       and the interface must not claim to know more than it does. */
    verifyResent: 'If that address needs verifying, a new code is on its way.',

    backToSignIn: 'Back to sign in',
    couldNotVerify: 'Could not verify the code.',
    couldNotResend: 'Could not send a new code.',

    pitchTitle: 'Upload your course PDFs, then ask them questions.',
    pitchBody:
      'Every answer is grounded in your own material and cites the page it came from. Turn any document into a quiz when it is time to revise.',
    pitchFooter: 'AI study assistant for university students',
  },

  /* ========================================================================
     intro - the video card on the sign-in, registration and settings pages

     One area rather than three, because it is one card rendered in three
     places. The heading is the settings section's heading as well: the
     component carries it, so the page never writes it twice.
     ======================================================================== */

  intro: {
    heading: 'About StudyMate',

    /* Shown while lib/media.js still holds null, which is the state the app
       ships in. A sentence rather than an empty frame - there is nothing
       broken to apologise for, only something not written yet. */
    comingSoon: 'A short video tour of StudyMate is on its way.',

    /* The sentence under the player, once there is one: what the video
       shows, so nobody has to press play to find out. */
    caption:
      'The video walks through uploading a document, asking it questions, and turning it into a quiz.',

    /* There is one video and it is in English, in both interfaces. Saying
       so is the whole point of this key - see the note beside it in ar.js,
       which is where it does its work. */
    languageNote: 'The video is in English.',

    /* The player's accessible name. A heading sits above it, but a heading
       is not what names a media element to a screen reader. */
    videoLabel: 'StudyMate intro video',

    /* Between the <video> tags: only a browser that cannot play the file at
       all ever reaches it. */
    unsupported: 'Your browser cannot play this video.',
  },

  /* ========================================================================
     documents - the library page, and the status words the chat page reuses
     ======================================================================== */

  documents: {
    eyebrow: 'Library',
    title: 'Documents',
    description:
      'Upload a document, wait for it to be indexed, then chat with it or turn it into a quiz.',

    loading: 'Loading your documents',
    couldNotLoad: 'Could not load your documents.',

    emptyTitle: 'No documents yet',
    emptyDescription:
      'Drop your first lecture notes or textbook chapter above. Processing usually takes a few seconds.',

    countOne: '{count} document',
    countOther: '{count} documents',
    stillProcessing: '{count} still processing',

    unsupportedFile: 'That file type cannot be uploaded.',

    /* The heading of the error block and the sentence inside it. The heading
       names the thing that failed; the sentence is what is said when the
       server gave no reason of its own. */
    uploadFailedTitle: 'Upload failed',
    uploadFailedMessage: 'Upload failed.',

    renameLabel: 'Document title',
    couldNotRename: 'Could not rename the document.',

    chat: 'Chat',

    deleteTitle: 'Delete this document?',
    deleteDescription:
      '"{title}" will be removed, along with its conversations and quizzes. This cannot be undone.',
    deleteConfirm: 'Delete document',
    couldNotDelete: 'Could not delete the document.',

    processingFailed:
      'Processing failed on the server. Delete this document and upload the PDF again.',
    indexing: 'Indexing in the background. This list refreshes every few seconds.',

    /* A document's own state, shown as a badge on this page and again in the
       chat page's header. The same three words about the same three states. */
    statusReady: 'Ready',
    statusFailed: 'Failed',
    statusPending: 'Pending',
  },

  /* ========================================================================
     upload - the drop zone
     ======================================================================== */

  upload: {
    dropHere: 'Drop a file here',

    /* Three pieces of one sentence, because a button sits in the middle of
       it: "or browse your files. PDF, Word, PowerPoint, Excel or
       OpenDocument." Batch 2 will want this as one sentence with the button
       around a marked word instead.

       The format names are written the way the student sees them in their
       own machine's file picker, rather than as extensions. */
    or: 'or',
    browse: 'browse your files',
    fileTypes: '. PDF, Word, PowerPoint, Excel or OpenDocument.',

    uploading: 'Uploading',
    progress: 'Upload progress',
  },

  /* ========================================================================
     voice - the microphone beside a text field
     ======================================================================== */

  voice: {
    speak: 'Speak',
    stopListening: 'Stop listening',
    languageGroup: 'Speech recognition language',
    couldNotStart: 'The microphone could not be started. Try again in a moment.',

    /* One per error code in the SpeechRecognition spec. The component picks
       the key; the codes themselves stay in VoiceInput.jsx. */
    errBlocked:
      'The microphone was blocked. Allow it for this site in your browser, then try again.',
    errNoService:
      'This browser would not start its speech service. You can type the answer instead.',
    errNoMicrophone: 'No microphone was found. Connect one, or type instead.',
    errNoSpeech: 'Nothing was heard. Try again, a little closer to the microphone.',
    errNetwork:
      'Speech recognition needs a connection, and this request did not get through.',
    errUnexpected: 'The microphone stopped unexpectedly. You can type instead.',
  },

  /* ========================================================================
     sources - the citations under an answer
     ======================================================================== */

  sources: {
    countOne: '{count} citation',
    countOther: '{count} citations',
    page: 'Page {page}',
    source: 'Source {number}',

    /* Stood in for by parseSource when a citation arrives as null. */
    empty: '(empty source)',
  },

  /* ========================================================================
     chat - asking a document questions
     ======================================================================== */

  chat: {
    loadingDocument: 'Loading document',
    couldNotLoadDocument: 'Could not load this document.',
    documentNotFound: 'Document not found',

    /* The arrow that used to live in front of this is now a span of its own
       in the markup, so it can be mirrored in a right-to-left layout without
       mirroring the words with it. */
    allDocuments: 'All documents',

    newThread: 'New thread',

    stillIndexing: 'Still indexing',
    stillIndexingBody:
      'Chat opens as soon as this document finishes processing. The status above refreshes on its own.',

    emptyTitle: 'Ask your first question',
    emptyDescription:
      'Answers are drawn only from this document and cite the page they came from.',

    /* The three suggestions offered on an empty thread. They are sent as the
       question, so they are written as a student would type them. */
    ideaSummarise: 'Summarise the key points of section 1',
    ideaSimpler: 'Explain this in simpler terms',
    ideaFigures: 'What are the main figures mentioned?',

    couldNotLoadConversation: 'Could not load that conversation.',
    wrongDocument: 'That conversation belongs to a different document.',

    /* The field's accessible name and its placeholder. Near-identical in
       English and still two keys: the label names the field for a screen
       reader, the placeholder is an invitation inside an empty box. */
    inputLabel: 'Ask about this document',
    inputPlaceholder: 'Ask about this document...',
    inputPlaceholderWaiting: 'Waiting for processing...',

    send: 'Send',
    messageNotSent: 'Message not sent',
    couldNotAnswer: 'The assistant could not answer.',

    searching: 'Searching your document',
    emptyAnswer: '(empty answer)',
  },

  /* ========================================================================
     conversations - the history page and one saved thread
     ======================================================================== */

  conversations: {
    eyebrow: 'History',
    title: 'Conversations',
    description:
      'Every thread you have started with a document, grouped by the document it came from. A conversation is titled with the first question you asked, and can be renamed.',

    /* Loading the list of threads, and loading one thread. Different things
       being waited for, so different sentences. */
    loading: 'Loading conversations',
    loadingOne: 'Loading conversation',

    couldNotLoad: 'Could not load your conversations.',
    couldNotLoadDetail: 'Could not load this conversation.',

    unknownDocumentTitle: 'That document is not here',
    unknownDocumentDescription:
      'It may have been deleted, which takes its conversations with it. The documents you have talked to are listed on the way back.',

    /* The button in the empty state, and the small link above a filtered
       list. One offers a way out of a dead end, the other clears a filter. */
    allDocumentsButton: 'All documents',
    allDocumentsBack: 'All documents',

    emptyTitle: 'No conversations yet',
    emptyDescription:
      'Open a document that has finished processing and ask a question to start one.',

    yourDocuments: 'Your documents',
    aboutDocument: 'Conversations about {title}',
    countOne: '{count} conversation',
    countOther: '{count} conversations',

    /* A thread whose document is not in the documents list, and a thread the
       server sent with no title of its own. */
    untitledDocument: 'Untitled document',
    fallbackTitle: 'Conversation {number}',

    renameLabel: 'Conversation title',
    needsTitle: 'A conversation needs a title.',
    couldNotRename: 'Could not rename this conversation.',

    confirmDelete: 'Delete this thread and its messages?',
    couldNotDelete: 'Could not delete this conversation.',

    notFound: 'Conversation not found',
    untitled: 'Conversation',
    allConversations: 'All conversations',
    continue: 'Continue this conversation',
    noMessagesTitle: 'No messages in this conversation',
    noMessagesDescription: 'The API returned no messages for this thread.',
  },

  /* ========================================================================
     quiz - generating one, taking one, and being marked
     ======================================================================== */

  quiz: {
    eyebrow: 'Revision',
    title: 'Quizzes',
    description:
      'Generate a quiz from a document you have already uploaded, then take it.',

    loading: 'Loading your quizzes',
    couldNotLoad: 'Could not load your quizzes.',

    noDocumentsTitle: 'No processed documents',
    noDocumentsDescription:
      'A quiz is generated from a document, so upload a PDF and wait for it to finish indexing first.',
    goToDocuments: 'Go to documents',

    /* ---- The create form ---- */

    documentLabel: 'Document',

    /* The field label on the create form. The rename box below has its own
       key: one names a field being filled in, the other names a box holding
       a name that already exists. */
    titleLabel: 'Quiz title',
    titlePlaceholder: 'Chapter 3 review',

    countLabel: 'Number of questions',
    countHint: 'Between 1 and 50, and at least one for each type you pick.',

    typesLegend: 'Question types',
    typeMultipleChoice: 'Multiple choice',
    typeTrueFalse: 'True / false',
    typeShortAnswer: 'Short answer',

    /* The badge on a question while a quiz is being taken, keyed by the
       backend's own slug. Deliberately NOT the same keys as the three form
       labels above: those name a type you are asking for, these name the
       type a question turned out to be, and a language that wants to shorten
       a badge will not want the form's checkbox shortened with it.

       Same words as the form labels, though. These used to read "True False"
       and "Multiple Choice", which was not a decision - it was whatever
       questionTypeLabel() happened to produce by replacing the underscore
       and title-casing the result. A badge and a checkbox naming the same
       thing two different ways on the same page is a defect, so they now
       agree; the keys stay separate so they can stop agreeing on purpose. */
    type: {
      multiple_choice: 'Multiple choice',
      true_false: 'True / false',
      short_answer: 'Short answer',
      unknown: 'Question',
    },
    typesHint:
      'Pick at least one. All three is the same as leaving it alone. The questions are split evenly between the types you pick.',

    pagesLegend: 'Pages',
    pageFrom: 'From',
    pageTo: 'To',

    /* Example page numbers. They are here rather than left in the markup
       because the digits themselves are a translation decision: Arabic is
       written with either Western or Arabic-Indic numerals. */
    pageFromPlaceholder: '1',
    pageToPlaceholder: '20',

    pagesHint:
      'Counted from the first page of the PDF file, which is often not the number printed on the page.',
    pagesHintCount: 'This document has {count} pages.',
    pagesHintWhole: 'Leave both empty to use the whole document.',

    focusLabel: 'What should it focus on?',
    focusPlaceholder:
      'For example: the rules of building the imperative verb, not the vocabulary',
    focusHint: 'Used while generating, then discarded. It is not saved with the quiz.',

    footerNote:
      'Questions are written from this document only. Anything the generator produces outside the types you picked is discarded before the quiz is saved.',

    generating: 'Generating...',
    create: 'Create quiz',

    /* ---- What the form refuses to send ---- */

    pickDocument: 'Pick a document first.',
    giveTitle: 'Give the quiz a title.',
    countRange: 'Ask for between 1 and 50 questions.',
    pickType: 'Pick at least one question type.',
    notEnoughQuestionsOne:
      '{count} question is not enough for {types} question types: each type needs at least one question.',
    notEnoughQuestionsOther:
      '{count} questions is not enough for {types} question types: each type needs at least one question.',
    pageRangeBoth: 'Give both a first and a last page, or leave both empty.',
    firstPageMin: 'The first page must be 1 or greater.',
    lastPageWhole: 'The last page must be a whole number.',
    lastPageBeforeFirst: 'The last page cannot come before the first page.',

    noQuizId:
      'The quiz was created but the response contained no quiz_id, so it cannot be opened.',
    couldNotCreate: 'Could not create the quiz.',

    createdWithWarnings: '“{title}” was created, with something to mention:',
    openQuiz: 'Open the quiz',

    /* ---- The list ---- */

    unknownDocumentTitle: 'That document is not here',
    unknownDocumentDescription:
      'It may have been deleted, or it may still be processing. The list of documents below has the ones that can be quizzed.',
    allDocumentsButton: 'All documents',
    allDocumentsBack: 'All documents',

    yourDocuments: 'Your documents',
    fromDocument: 'Quizzes from {title}',
    noneFromDocument:
      'No quizzes from this document yet. Create one above and it will appear here.',
    noneYet: 'No quizzes yet',
    countOne: '{count} quiz',
    countOther: '{count} quizzes',

    /* The second line of a quiz row. Separate from countOne/countOther above,
       which count quizzes rather than what is inside one. */
    rowQuestionsOne: '{count} question',
    rowQuestionsOther: '{count} questions',
    rowAttemptsOne: '{count} attempt',
    rowAttemptsOther: '{count} attempts',

    renameLabel: 'Quiz title',
    needsTitle: 'A quiz needs a title.',
    couldNotRename: 'Could not rename this quiz.',

    confirmDelete: 'Delete this quiz?',
    confirmDeleteWithAttemptsOne: 'Delete this quiz and its {count} attempt?',
    confirmDeleteWithAttemptsOther: 'Delete this quiz and its {count} attempts?',
    couldNotDelete: 'Could not delete this quiz.',

    /* ---- Taking one ---- */

    loadingOne: 'Loading quiz',
    couldNotLoadOne: 'Could not load this quiz.',
    notFound: 'Quiz not found',
    allQuizzes: 'All quizzes',

    headerCountOne: '{count} question · mixed question types',
    headerCountOther: '{count} questions · mixed question types',

    /* The stopwatch, before and after submitting. It is still running in one
       and finished in the other, which is the whole difference. */
    timeElapsed: 'Time elapsed',
    timeTaken: 'Time taken',

    print: 'Print',

    answeredOf: '{answered} of {total} answered',
    progressLabel: 'Questions answered',

    noQuestionsTitle: 'This quiz has no questions',
    noQuestionsDescription: 'The API returned no questions for this quiz.',

    questionOf: 'Question {number} of {total}',
    noQuestionText: '(no question text returned)',
    optionsLabel: 'Options',

    yourAnswerLabel: 'Your answer',
    answerPlaceholder: 'Type your answer',
    freeTextHint:
      'Answer in your own words. It is judged on meaning, not on matching the document’s wording.',
    unknownTypeHint:
      'This question type was not recognised, so it accepts a free-text answer.',

    fromPage: 'From page {page}',

    submit: 'Submit answers',
    unanswered: '{count} unanswered',
    couldNotSubmit: 'Could not submit your answers.',
    retake: 'Retake quiz',
    backToQuizzes: 'Back to quizzes',

    /* ---- The mark ---- */

    /* The verdict we render, which is a fixed value and therefore ours to
       translate. The sentence Claude writes explaining it sits directly
       underneath and is not translated - that is the student's content. */
    verdictCorrect: 'Correct',
    verdictPartial: 'Partially correct',
    verdictIncorrect: 'Incorrect',

    /* The marker on the option that was right, in the list of options. Not
       the same as the verdict above: this one labels a thing, that one
       judges an answer. */
    correctAnswerMarker: 'Correct answer',

    /* A label rather than a sentence with the answer inside it: the answer
       is the student's own text and is rendered in its own dir="auto" span,
       so that an English answer inside an Arabic page keeps its punctuation
       where it belongs. Same shape as attempts.youWrote. */
    youAnswered: 'You answered: ',
    modelAnswer: 'Model answer: ',

    resultEyebrow: 'Result',
    scoreOf: '{score} of {total}',
    submitted: 'Submitted',

    /* Four pieces of one sentence, assembled from whichever counts the
       server sent. The commas are inside the strings so a translator can
       change them - Arabic does not use this comma. Batch 2 should look at
       whether this can become whole sentences instead. */
    scoreCorrect: '{count} correct',
    scorePartial: ', {count} partially correct',
    scoreWrong: ', {count} incorrect',
    scoreSuffix: '. Per-question results are marked below.',
    scoreFallback: 'Scored by the server. Per-question results are marked below.',
  },

  /* ========================================================================
     attempts - the history table under a quiz
     ======================================================================== */

  attempts: {
    title: 'Previous attempts',

    colAttempt: 'Attempt',
    colScore: 'Score',
    colPercentage: 'Percentage',
    colTime: 'Time',
    colTaken: 'Taken',
    colAnswers: 'Answers',

    viewAnswers: 'View answers',
    hideAnswers: 'Hide answers',

    loadingAnswers: 'Loading your answers',
    couldNotLoad: 'Could not load this attempt.',

    note: 'Newest first. Choice questions are re-checked here; written answers show yours next to the model answer without a mark.',

    noAnswers: 'This attempt recorded no answers.',
    youWrote: 'You wrote: ',

    /* "Correct: " here labels the answer that was right. It is not the
       verdict "Correct" on a marked question, and the two must not share a
       key: one is a noun phrase introducing a value, the other judges an
       answer, and most languages write them differently. */
    correctLabel: 'Correct: ',

    nothing: 'nothing',
    notKept: 'Written answer — the mark it was given at the time is not kept.',
  },

  /* ========================================================================
     settings - appearance and account
     ======================================================================== */

  settings: {
    title: 'Settings',
    subtitle: 'Appearance and account.',

    appearance: 'Appearance',

    /* The two option labels are not here. A language names itself in its own
       language, so "English" and "العربية" are written into the markup and
       read the same whichever language is running. */
    language: 'Language',

    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystemHint: 'Follow the setting on this device.',
    themeLightHint: 'Always the light palette.',
    themeDarkHint: 'Always the dark palette.',

    account: 'Account',

    name: 'Name',
    signedInAs: 'Signed in as {email}.',
    saveName: 'Save name',
    nameSaved: 'Name saved.',
    couldNotSaveName: 'Could not save your name.',

    /* The heading over the three password fields, and the button that
       submits them. The same two words doing two jobs: one names a section,
       the other is an instruction. */
    changePasswordHeading: 'Change password',
    changePassword: 'Change password',

    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    passwordsDoNotMatch: 'The two new passwords do not match.',
    passwordChanged:
      'Password changed. Any other device signed in to this account has been signed out.',
    couldNotChangePassword: 'Could not change your password.',
  },

  /* ========================================================================
     contact - the contact form
     ======================================================================== */

  contact: {
    /* The page title, not the sidebar link. nav.contact is the signpost
       and this is the heading it leads to; a language that shortens one
       will not want the other shortened with it. */
    title: 'Contact us',

    /* Says what the form is for and, just as importantly, what it is
       not: there is no promise of a reply time anywhere in this section,
       because that is a promise the app cannot keep. */
    subtitle: 'Tell us about a problem, or about something that should work differently.',

    /* The two read-only fields. They say "your", because the value is
       the student's own account detail rather than something they are
       being asked for. */
    fullName: 'Your name',
    email: 'Your email',

    /* Under the pair of them, explaining why they cannot be typed in.
       A read-only field with no explanation reads as a broken field. */
    fromAccountHint: 'Taken from your account, so we know who wrote and where to reply.',

    message: 'Message',
    messagePlaceholder: 'What happened, and what you expected instead.',

    send: 'Send message',

    /* Confirms that the message was received - which is exactly what
       has been confirmed, because the row is stored before any email is
       attempted. It says nothing about when anyone will answer. */
    sent: 'Your message has been received. Thank you.',

    couldNotSend: 'Could not send your message.',
  },

  /* ========================================================================
     pin - the pin control in a quiz row and a conversation row
     ======================================================================== */

  /* Complete sentences, one set per kind of row, rather than one template
     with the noun dropped into it. English builds "Pin this quiz" and "Pin
     this conversation" out of one sentence and two nouns; Arabic does not,
     because the demonstrative agrees with the noun. A shared template would
     be a key that cannot be translated correctly for both. */
  pin: {
    pin: {
      quiz: 'Pin this quiz',
      conversation: 'Pin this conversation',
    },
    pinToTop: {
      quiz: 'Pin this quiz to the top',
      conversation: 'Pin this conversation to the top',
    },
    unpin: {
      quiz: 'Unpin this quiz',
      conversation: 'Unpin this conversation',
    },
    pinFailed: {
      quiz: 'Could not pin this quiz.',
      conversation: 'Could not pin this conversation.',
    },
    unpinFailed: {
      quiz: 'Could not unpin this quiz.',
      conversation: 'Could not unpin this conversation.',
    },
  },

  /* ========================================================================
     notfound - the catch-all route
     ======================================================================== */

  notfound: {
    title: 'Page not found',
    description: 'That route does not exist in StudyMate.',
    backToDocuments: 'Back to documents',
  },
}
