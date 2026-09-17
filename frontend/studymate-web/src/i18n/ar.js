/* ==========================================================================
   Arabic - the interface, translated.

   Same nesting and the same key order as en.js, line for line, so the two
   can be read side by side. Anything missing here falls back to the English,
   which is what makes a partial translation survivable - but nothing is
   missing, and scripts/check-i18n-keys.mjs is how that stays true.

   THREE DECISIONS WORTH KNOWING BEFORE EDITING THIS FILE:

   1. NO COUNTED PLURALS. Arabic agrees a noun with its number in six
      different ways, and this project has no plural machinery and wants
      none. So nothing here is written as "3 attempts". It is written as
      "عدد المحاولات: 3" - a label and a number - which is correct whatever
      the number turns out to be. The English keys keep the two forms English
      needs; several of them are word for word identical on this side, and
      that is the intended result rather than a copy-and-paste slip.

   2. LATIN DIGITS, NEVER ARABIC-INDIC. 1, 2, 3 and not ١، ٢، ٣, everywhere:
      page numbers, scores, the timer, question counts. Dates go through
      `ar-u-nu-latn` for the same reason - Arabic month names, Latin digits.

   3. VERBAL NOUN FOR A HEADING, IMPERATIVE FOR A BUTTON. "تغيير كلمة
      المرور" names a section; "غيّر كلمة المرور" is the button that does it.
      Several keys exist as pairs in en.js precisely so this distinction can
      be made here - settings.changePasswordHeading against
      settings.changePassword, auth.signInLink against auth.signIn.
   ========================================================================== */

export default {
  /* ========================================================================
     common
     ======================================================================== */

  common: {
    save: 'احفظ',
    cancel: 'ألغِ',
    delete: 'احذف',
    rename: 'أعد التسمية',
    reload: 'أعد التحميل',
    tryAgain: 'حاول مرة أخرى',

    loading: 'جارٍ التحميل',

    somethingWentWrong: 'حدث خطأ ما',
    backToTop: 'العودة إلى الأعلى',

    deleting: 'جارٍ الحذف...',
    yesDelete: 'نعم، احذف',

    optional: '(اختياري)',
  },

  /* ========================================================================
     errors
     ======================================================================== */

  errors: {
    generic: 'حدث خطأ ما.',

    sessionExpired: 'انتهت صلاحية جلستك. سجّل الدخول من جديد.',
    forbidden: 'ليس لديك صلاحية الوصول إلى هذا المورد.',
    notFound: 'غير موجود.',
    requestFailed: 'فشل الطلب (HTTP {status}).',
    unreachable: 'تعذّر الوصول إلى الخادم. هل الخادم يعمل؟',
  },

  /* ========================================================================
     password
     ======================================================================== */

  password: {
    hint: 'لا تقل عن {min} أحرف، وتتضمّن حرفًا ورقمًا.',

    errLength: 'يجب أن تتكوّن كلمة المرور من {min} أحرف على الأقل.',
    errLetter: 'يجب أن تتضمّن كلمة المرور حرفًا واحدًا على الأقل.',
    errDigit: 'يجب أن تتضمّن كلمة المرور رقمًا واحدًا على الأقل.',
    errLengthLetter:
      'يجب أن تتكوّن كلمة المرور من {min} أحرف على الأقل، وأن تتضمّن حرفًا واحدًا على الأقل.',
    errLengthDigit:
      'يجب أن تتكوّن كلمة المرور من {min} أحرف على الأقل، وأن تتضمّن رقمًا واحدًا على الأقل.',
    errLetterDigit:
      'يجب أن تتضمّن كلمة المرور حرفًا واحدًا ورقمًا واحدًا على الأقل.',
    errLengthLetterDigit:
      'يجب أن تتكوّن كلمة المرور من {min} أحرف على الأقل، وأن تتضمّن حرفًا واحدًا ورقمًا واحدًا.',
  },

  /* ========================================================================
     server - the backend's own messages, recognised by lib/serverErrors.js
     ======================================================================== */

  server: {
    invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    emailRegistered: 'هذا البريد الإلكتروني مسجّل من قبل',
    onlyPdf: 'الملفات المدعومة هي PDF فقط',
    currentPasswordIncorrect: 'كلمة المرور الحالية غير صحيحة',

    numQuestionsMin: 'عدد الأسئلة لا يقل عن 1',
    numQuestionsMax: 'عدد الأسئلة لا يزيد على 50',
    notEnoughQuestions:
      'عدد الأسئلة المطلوب ({count}) لا يكفي لعدد الأنواع ({types})؛ كل نوع يحتاج سؤالًا واحدًا على الأقل.',

    pageRangeBoth: 'حدّد صفحة البداية وصفحة النهاية معًا، أو اترك الحقلين فارغين.',
    firstPageMin: 'صفحة البداية لا تقل عن 1.',
    lastPageBeforeFirst: 'صفحة النهاية لا تسبق صفحة البداية.',
    noSuchPage: 'عدد صفحات هذا المستند: {pages}، فلا توجد فيه صفحة رقم {page}.',

    /* كل رقم يليه "ميجابايت" مباشرة، فلا يقع رقمان متجاورين في أي جملة. */
    unsupportedType: 'الملفات المدعومة هي PDF وWord وPowerPoint وExcel وOpenDocument.',
    uploadTooLarge: 'حجم هذا الملف يتجاوز حدّ الرفع البالغ {limit} ميجابايت.',
    convertTooLarge:
      'حدّ ملفات Office هو {convertLimit} ميجابايت لأنها تُحوَّل أولًا، أما ملفات PDF فيُقبل منها حتى {uploadLimit} ميجابايت.',
    conversionUnavailable: 'تعذّر تحويل هذا النوع من الملفات على الخادم الآن. ارفع ملف PDF بدلًا منه.',
  },

  /* ========================================================================
     nav
     ======================================================================== */

  nav: {
    documents: 'المستندات',
    conversations: 'المحادثات',
    quizzes: 'الاختبارات',

    mainNavigation: 'التنقّل الرئيسي',
    skipToContent: 'تخطَّ إلى المحتوى',
    openMenu: 'افتح القائمة',
    closeMenu: 'أغلق القائمة',

    settings: 'الإعدادات',

    signedIn: 'مسجّل الدخول',
  },

  /* ========================================================================
     auth
     ======================================================================== */

  auth: {
    /* The button that submits the form. */
    signIn: 'سجّل الدخول',

    /* The link over to that page, which names a destination rather than
       giving an instruction. */
    signInLink: 'تسجيل الدخول',

    signOut: 'سجّل الخروج',

    email: 'البريد الإلكتروني',
    emailPlaceholder: 'you@university.edu',
    password: 'كلمة المرور',
    fullName: 'الاسم الكامل',
    fullNamePlaceholder: 'حنان محمد',

    welcomeBack: 'أهلًا بعودتك',
    signInSubtitle: 'سجّل الدخول بالبريد الإلكتروني وكلمة المرور اللذين سجّلت بهما.',
    noAccountYet: 'ليس لديك حساب؟',
    createOne: 'أنشئ حسابًا',
    couldNotSignIn: 'تعذّر تسجيل الدخول.',

    createAccount: 'أنشئ الحساب',
    createAccountTitle: 'إنشاء حسابك',
    createAccountSubtitle: 'سجّل أولًا، ثم ارفع أول ملف PDF لك.',
    alreadyRegistered: 'مسجّل من قبل؟',
    couldNotCreateAccount: 'تعذّر إنشاء الحساب.',

    pitchTitle: 'ارفع ملفات مقرّرك، ثم اسألها.',
    pitchBody:
      'كل إجابة مبنية على مادتك أنت، وتذكر الصفحة التي جاءت منها. وحوّل أي مستند إلى اختبار حين يحين وقت المراجعة.',
    pitchFooter: 'مساعد دراسي بالذكاء الاصطناعي لطلبة الجامعات',
  },

  /* ========================================================================
     intro
     ======================================================================== */

  intro: {
    /* A verbal noun, as a heading takes: "حول" and not "تعرّف على". */
    heading: 'حول StudyMate',

    comingSoon: 'جولة مصوّرة قصيرة في StudyMate في الطريق.',

    caption: 'يعرض الفيديو رفع مستند، وسؤاله، ثم تحويله إلى اختبار.',

    /* THE REASON THIS KEY EXISTS. There is one video and it is in English,
       and it is shown here too. A student who presses play expecting Arabic
       and hears English was let down by the interface rather than by the
       video, so the interface says so first - in the placeholder state as
       well, before the file is even there.

       The English side says the same thing rather than nothing, because a
       key that renders in one language only is a key that stops being
       maintained in the other. When an Arabic recording exists, it becomes
       a path in lib/media.js and this sentence is what changes with it. */
    languageNote: 'الفيديو باللغة الإنجليزية.',

    videoLabel: 'فيديو تعريفي عن StudyMate',

    unsupported: 'لا يستطيع متصفحك تشغيل هذا الفيديو.',
  },

  /* ========================================================================
     documents
     ======================================================================== */

  documents: {
    eyebrow: 'المكتبة',
    title: 'المستندات',
    description: 'ارفع مستندًا، وانتظر فهرسته، ثم حاوره أو حوّله إلى اختبار.',

    loading: 'جارٍ تحميل مستنداتك',
    couldNotLoad: 'تعذّر تحميل مستنداتك.',

    emptyTitle: 'لا توجد مستندات بعد',
    emptyDescription:
      'أفلت أول محاضرة أو فصل من كتابك في الأعلى. المعالجة تستغرق ثوانيَ عادةً.',

    /* One form, not two: see the note at the top of this file. */
    countOne: 'عدد المستندات: {count}',
    countOther: 'عدد المستندات: {count}',
    stillProcessing: 'قيد المعالجة: {count}',

    unsupportedFile: 'لا يمكن رفع هذا النوع من الملفات.',

    uploadFailedTitle: 'فشل الرفع',
    uploadFailedMessage: 'فشل الرفع.',

    renameLabel: 'عنوان المستند',
    couldNotRename: 'تعذّرت إعادة تسمية المستند.',

    chat: 'حاوره',

    deleteTitle: 'حذف هذا المستند؟',
    deleteDescription:
      'سيُحذف "{title}" ومعه محادثاته واختباراته. لا يمكن التراجع عن ذلك.',
    deleteConfirm: 'احذف المستند',
    couldNotDelete: 'تعذّر حذف المستند.',

    processingFailed: 'فشلت المعالجة على الخادم. احذف هذا المستند وارفع ملف PDF من جديد.',
    indexing: 'تجري الفهرسة في الخلفية. وتتحدّث هذه القائمة كل بضع ثوانٍ.',

    statusReady: 'جاهز',
    statusFailed: 'فشل',
    statusPending: 'قيد الانتظار',
  },

  /* ========================================================================
     upload
     ======================================================================== */

  upload: {
    dropHere: 'أفلت ملفًا هنا',

    or: 'أو',
    browse: 'تصفّح ملفاتك',
    fileTypes: '. ملفات PDF وWord وPowerPoint وExcel وOpenDocument.',

    uploading: 'جارٍ الرفع',
    progress: 'تقدّم الرفع',
  },

  /* ========================================================================
     voice
     ======================================================================== */

  voice: {
    speak: 'تحدّث',
    stopListening: 'أوقف الاستماع',
    languageGroup: 'لغة التعرّف على الكلام',
    couldNotStart: 'تعذّر تشغيل الميكروفون. حاول بعد قليل.',

    errBlocked: 'الميكروفون محجوب. اسمح به لهذا الموقع في متصفّحك ثم حاول مجددًا.',
    errNoService: 'لم يبدأ هذا المتصفّح خدمة الكلام لديه. يمكنك كتابة الإجابة بدلًا من ذلك.',
    errNoMicrophone: 'لم يُعثر على ميكروفون. وصّل واحدًا، أو اكتب بدلًا من ذلك.',
    errNoSpeech: 'لم يُسمع شيء. حاول مجددًا، واقترب قليلًا من الميكروفون.',
    errNetwork: 'يحتاج التعرّف على الكلام إلى اتصال، ولم يصل هذا الطلب.',
    errUnexpected: 'توقّف الميكروفون على غير المتوقّع. يمكنك الكتابة بدلًا من ذلك.',
  },

  /* ========================================================================
     sources
     ======================================================================== */

  sources: {
    countOne: 'عدد الاستشهادات: {count}',
    countOther: 'عدد الاستشهادات: {count}',
    page: 'صفحة {page}',
    source: 'المصدر {number}',

    empty: '(مصدر فارغ)',
  },

  /* ========================================================================
     chat
     ======================================================================== */

  chat: {
    loadingDocument: 'جارٍ تحميل المستند',
    couldNotLoadDocument: 'تعذّر تحميل هذا المستند.',
    documentNotFound: 'المستند غير موجود',
    allDocuments: 'كل المستندات',

    newThread: 'محادثة جديدة',

    stillIndexing: 'الفهرسة جارية',
    stillIndexingBody:
      'تُفتح المحادثة فور انتهاء معالجة هذا المستند. وتتحدّث الحالة في الأعلى تلقائيًا.',

    emptyTitle: 'اسأل سؤالك الأول',
    emptyDescription: 'الإجابات مستمدّة من هذا المستند وحده، وتذكر الصفحة التي جاءت منها.',

    /* These are sent as the question, so they are written the way a student
       would type them rather than the way an interface would phrase them. */
    ideaSummarise: 'لخّص أهم نقاط القسم الأول',
    ideaSimpler: 'اشرح هذا بعبارات أبسط',
    ideaFigures: 'ما أبرز الأرقام المذكورة؟',

    couldNotLoadConversation: 'تعذّر تحميل تلك المحادثة.',
    wrongDocument: 'تلك المحادثة تخصّ مستندًا آخر.',

    inputLabel: 'اسأل عن هذا المستند',
    inputPlaceholder: 'اسأل عن هذا المستند...',
    inputPlaceholderWaiting: 'في انتظار المعالجة...',

    send: 'أرسل',
    messageNotSent: 'لم تُرسل الرسالة',
    couldNotAnswer: 'تعذّر على المساعد الإجابة.',

    searching: 'جارٍ البحث في مستندك',
    emptyAnswer: '(إجابة فارغة)',
  },

  /* ========================================================================
     conversations
     ======================================================================== */

  conversations: {
    eyebrow: 'السجل',
    title: 'المحادثات',
    description:
      'كل محادثة بدأتها مع مستند، مجمّعة حسب المستند الذي جاءت منه. وتُسمّى المحادثة بأول سؤال سألته، ويمكن تغيير اسمها.',

    loading: 'جارٍ تحميل المحادثات',
    loadingOne: 'جارٍ تحميل المحادثة',

    couldNotLoad: 'تعذّر تحميل محادثاتك.',
    couldNotLoadDetail: 'تعذّر تحميل هذه المحادثة.',

    unknownDocumentTitle: 'هذا المستند غير موجود هنا',
    unknownDocumentDescription:
      'ربما حُذف، وحذفه يحذف محادثاته معه. والمستندات التي حاورتها مدرجة في طريق العودة.',

    allDocumentsButton: 'كل المستندات',
    allDocumentsBack: 'كل المستندات',

    emptyTitle: 'لا توجد محادثات بعد',
    emptyDescription: 'افتح مستندًا انتهت معالجته واسأل سؤالًا لتبدأ واحدة.',

    yourDocuments: 'مستنداتك',
    aboutDocument: 'محادثات عن {title}',
    countOne: 'عدد المحادثات: {count}',
    countOther: 'عدد المحادثات: {count}',

    untitledDocument: 'مستند بلا عنوان',
    fallbackTitle: 'المحادثة {number}',

    renameLabel: 'عنوان المحادثة',
    needsTitle: 'لا بد للمحادثة من عنوان.',
    couldNotRename: 'تعذّرت إعادة تسمية هذه المحادثة.',

    confirmDelete: 'حذف هذه المحادثة ورسائلها؟',
    couldNotDelete: 'تعذّر حذف هذه المحادثة.',

    notFound: 'المحادثة غير موجودة',
    untitled: 'محادثة',
    allConversations: 'كل المحادثات',
    continue: 'تابع هذه المحادثة',
    noMessagesTitle: 'لا رسائل في هذه المحادثة',
    noMessagesDescription: 'لم يُرجع الخادم أي رسائل لهذه المحادثة.',
  },

  /* ========================================================================
     quiz
     ======================================================================== */

  quiz: {
    eyebrow: 'المراجعة',
    title: 'الاختبارات',
    description: 'أنشئ اختبارًا من مستند رفعته من قبل، ثم أدِّه.',

    loading: 'جارٍ تحميل اختباراتك',
    couldNotLoad: 'تعذّر تحميل اختباراتك.',

    noDocumentsTitle: 'لا توجد مستندات معالَجة',
    noDocumentsDescription:
      'يُنشأ الاختبار من مستند، فارفع ملف PDF وانتظر انتهاء فهرسته أولًا.',
    goToDocuments: 'اذهب إلى المستندات',

    /* ---- The create form ---- */

    documentLabel: 'المستند',

    titleLabel: 'عنوان الاختبار',
    titlePlaceholder: 'مراجعة الفصل الثالث',

    countLabel: 'عدد الأسئلة',
    countHint: 'بين 1 و50، وسؤال واحد على الأقل لكل نوع تختاره.',

    typesLegend: 'أنواع الأسئلة',
    typeMultipleChoice: 'اختيار من متعدد',
    typeTrueFalse: 'صواب / خطأ',
    typeShortAnswer: 'إجابة قصيرة',

    /* The badge on a question, which names what a question turned out to be
       rather than what was asked for. Same words as the three form labels
       above - a badge and a checkbox naming the same thing two different
       ways on one page is a defect in either language - but kept as separate
       keys so they can be worded apart deliberately if they ever need to. */
    type: {
      multiple_choice: 'اختيار من متعدد',
      true_false: 'صواب / خطأ',
      short_answer: 'إجابة قصيرة',
      unknown: 'سؤال',
    },

    typesHint:
      'اختر نوعًا واحدًا على الأقل. واختيار الأنواع الثلاثة كترك الأمر كما هو. وتُوزَّع الأسئلة بالتساوي على الأنواع التي تختارها.',

    pagesLegend: 'الصفحات',
    pageFrom: 'من',
    pageTo: 'إلى',

    /* Latin digits, like every other number in this app. */
    pageFromPlaceholder: '1',
    pageToPlaceholder: '20',

    pagesHint: 'تُحسب من أول صفحة في ملف PDF، وهي غالبًا غير الرقم المطبوع على الصفحة.',
    pagesHintCount: 'عدد صفحات هذا المستند: {count}.',
    pagesHintWhole: 'اترك الحقلين فارغين لاستخدام المستند كاملًا.',

    focusLabel: 'على ماذا يركّز؟',
    focusPlaceholder: 'مثال: قواعد بناء فعل الأمر، لا المفردات',
    focusHint: 'يُستخدم أثناء الإنشاء ثم يُهمل. ولا يُحفظ مع الاختبار.',

    footerNote:
      'تُكتب الأسئلة من هذا المستند وحده. وكل ما ينتجه المولّد خارج الأنواع التي اخترتها يُستبعد قبل حفظ الاختبار.',

    generating: 'جارٍ الإنشاء...',
    create: 'أنشئ الاختبار',

    /* ---- What the form refuses to send ---- */

    pickDocument: 'اختر مستندًا أولًا.',
    giveTitle: 'أعطِ الاختبار عنوانًا.',
    countRange: 'اطلب عددًا بين 1 و50 سؤالًا.',
    pickType: 'اختر نوع سؤال واحدًا على الأقل.',
    notEnoughQuestionsOne:
      'عدد الأسئلة المطلوب ({count}) لا يكفي لعدد الأنواع ({types})؛ كل نوع يحتاج سؤالًا واحدًا على الأقل.',
    notEnoughQuestionsOther:
      'عدد الأسئلة المطلوب ({count}) لا يكفي لعدد الأنواع ({types})؛ كل نوع يحتاج سؤالًا واحدًا على الأقل.',
    pageRangeBoth: 'حدّد صفحة البداية وصفحة النهاية معًا، أو اترك الحقلين فارغين.',
    firstPageMin: 'صفحة البداية لا تقل عن 1.',
    lastPageWhole: 'صفحة النهاية لا بد أن تكون عددًا صحيحًا.',
    lastPageBeforeFirst: 'صفحة النهاية لا تسبق صفحة البداية.',

    noQuizId: 'أُنشئ الاختبار لكن الاستجابة لم تتضمّن quiz_id، فتعذّر فتحه.',
    couldNotCreate: 'تعذّر إنشاء الاختبار.',

    createdWithWarnings: 'أُنشئ «{title}»، مع ما يستحق الذكر:',
    openQuiz: 'افتح الاختبار',

    /* ---- The list ---- */

    unknownDocumentTitle: 'هذا المستند غير موجود هنا',
    unknownDocumentDescription:
      'ربما حُذف، أو لا يزال قيد المعالجة. وقائمة المستندات في الأسفل فيها ما يمكن إنشاء اختبار منه.',
    allDocumentsButton: 'كل المستندات',
    allDocumentsBack: 'كل المستندات',

    yourDocuments: 'مستنداتك',
    fromDocument: 'اختبارات من {title}',
    noneFromDocument: 'لا اختبارات من هذا المستند بعد. أنشئ واحدًا في الأعلى وسيظهر هنا.',
    noneYet: 'لا اختبارات بعد',
    countOne: 'عدد الاختبارات: {count}',
    countOther: 'عدد الاختبارات: {count}',

    rowQuestionsOne: 'عدد الأسئلة: {count}',
    rowQuestionsOther: 'عدد الأسئلة: {count}',
    rowAttemptsOne: 'عدد المحاولات: {count}',
    rowAttemptsOther: 'عدد المحاولات: {count}',

    renameLabel: 'عنوان الاختبار',
    needsTitle: 'لا بد للاختبار من عنوان.',
    couldNotRename: 'تعذّرت إعادة تسمية هذا الاختبار.',

    confirmDelete: 'حذف هذا الاختبار؟',
    confirmDeleteWithAttemptsOne: 'حذف هذا الاختبار ومحاولاته (عددها {count})؟',
    confirmDeleteWithAttemptsOther: 'حذف هذا الاختبار ومحاولاته (عددها {count})؟',
    couldNotDelete: 'تعذّر حذف هذا الاختبار.',

    /* ---- Taking one ---- */

    loadingOne: 'جارٍ تحميل الاختبار',
    couldNotLoadOne: 'تعذّر تحميل هذا الاختبار.',
    notFound: 'الاختبار غير موجود',
    allQuizzes: 'كل الاختبارات',

    headerCountOne: 'عدد الأسئلة: {count} · أنواع أسئلة مختلطة',
    headerCountOther: 'عدد الأسئلة: {count} · أنواع أسئلة مختلطة',

    timeElapsed: 'الوقت المنقضي',
    timeTaken: 'الوقت المستغرق',

    print: 'اطبع',

    answeredOf: 'أُجيب عن {answered} من {total}',
    progressLabel: 'الأسئلة المُجاب عنها',

    noQuestionsTitle: 'لا أسئلة في هذا الاختبار',
    noQuestionsDescription: 'لم يُرجع الخادم أي أسئلة لهذا الاختبار.',

    questionOf: 'السؤال {number} من {total}',
    noQuestionText: '(لم يُرجَع نص السؤال)',
    optionsLabel: 'الخيارات',

    yourAnswerLabel: 'إجابتك',
    answerPlaceholder: 'اكتب إجابتك',
    freeTextHint: 'أجب بكلماتك أنت. والتقييم على المعنى، لا على مطابقة صياغة المستند.',
    unknownTypeHint: 'لم يُتعرَّف على نوع هذا السؤال، فهو يقبل إجابة نصّية حرّة.',

    fromPage: 'من صفحة {page}',

    submit: 'أرسل الإجابات',
    unanswered: 'بلا إجابة: {count}',
    couldNotSubmit: 'تعذّر إرسال إجاباتك.',
    retake: 'أعد الاختبار',
    backToQuizzes: 'العودة إلى الاختبارات',

    /* ---- The mark ---- */

    verdictCorrect: 'صحيحة',
    verdictPartial: 'صحيحة جزئيًا',
    verdictIncorrect: 'خاطئة',

    correctAnswerMarker: 'الإجابة الصحيحة',

    youAnswered: 'أجبت: ',
    modelAnswer: 'الإجابة النموذجية: ',

    resultEyebrow: 'النتيجة',
    scoreOf: '{score} من {total}',
    submitted: 'أُرسلت',

    /* The comma at the front of the two middle pieces is the Arabic comma,
       which is the whole reason it was left inside the string. */
    scoreCorrect: 'صحيحة: {count}',
    scorePartial: '، صحيحة جزئيًا: {count}',
    scoreWrong: '، خاطئة: {count}',
    scoreSuffix: '. ونتيجة كل سؤال موضّحة أدناه.',
    scoreFallback: 'صُحّح على الخادم. ونتيجة كل سؤال موضّحة أدناه.',
  },

  /* ========================================================================
     attempts
     ======================================================================== */

  attempts: {
    title: 'المحاولات السابقة',

    colAttempt: 'المحاولة',
    colScore: 'الدرجة',
    colPercentage: 'النسبة',
    colTime: 'المدة',
    colTaken: 'التاريخ',
    colAnswers: 'الإجابات',

    viewAnswers: 'اعرض الإجابات',
    hideAnswers: 'أخفِ الإجابات',

    loadingAnswers: 'جارٍ تحميل إجاباتك',
    couldNotLoad: 'تعذّر تحميل هذه المحاولة.',

    note: 'الأحدث أولًا. وتُراجَع أسئلة الاختيار هنا؛ أما الإجابات المكتوبة فتُعرض إجابتك بجوار الإجابة النموذجية بلا تقييم.',

    noAnswers: 'لم تسجّل هذه المحاولة أي إجابات.',
    youWrote: 'كتبت: ',

    /* A label introducing the right answer, not the verdict "صحيحة" on a
       marked question - the same distinction en.js keeps. */
    correctLabel: 'الصحيحة: ',

    nothing: 'لا شيء',
    notKept: 'إجابة مكتوبة — التقييم الذي أُعطي لها وقتها غير محفوظ.',
  },

  /* ========================================================================
     settings
     ======================================================================== */

  settings: {
    title: 'الإعدادات',
    subtitle: 'المظهر والحساب.',

    appearance: 'المظهر',

    language: 'اللغة',

    theme: 'السمة',
    themeSystem: 'النظام',
    themeLight: 'فاتحة',
    themeDark: 'داكنة',
    themeSystemHint: 'اتّبع إعداد هذا الجهاز.',
    themeLightHint: 'اللوحة الفاتحة دائمًا.',
    themeDarkHint: 'اللوحة الداكنة دائمًا.',

    account: 'الحساب',

    name: 'الاسم',
    signedInAs: 'مسجّل الدخول بـ {email}.',
    saveName: 'احفظ الاسم',
    nameSaved: 'حُفظ الاسم.',
    couldNotSaveName: 'تعذّر حفظ اسمك.',

    /* The heading names the thing; the button gives the instruction. */
    changePasswordHeading: 'تغيير كلمة المرور',
    changePassword: 'غيّر كلمة المرور',

    currentPassword: 'كلمة المرور الحالية',
    newPassword: 'كلمة المرور الجديدة',
    confirmNewPassword: 'تأكيد كلمة المرور الجديدة',
    passwordsDoNotMatch: 'كلمتا المرور الجديدتان غير متطابقتين.',
    passwordChanged:
      'غُيّرت كلمة المرور. وسُجّل خروج أي جهاز آخر كان داخلًا بهذا الحساب.',
    couldNotChangePassword: 'تعذّر تغيير كلمة مرورك.',
  },

  /* ========================================================================
     pin
     ======================================================================== */

  pin: {
    pin: {
      quiz: 'ثبّت هذا الاختبار',
      conversation: 'ثبّت هذه المحادثة',
    },
    pinToTop: {
      quiz: 'ثبّت هذا الاختبار في الأعلى',
      conversation: 'ثبّت هذه المحادثة في الأعلى',
    },
    unpin: {
      quiz: 'ألغِ تثبيت هذا الاختبار',
      conversation: 'ألغِ تثبيت هذه المحادثة',
    },
    pinFailed: {
      quiz: 'تعذّر تثبيت هذا الاختبار.',
      conversation: 'تعذّر تثبيت هذه المحادثة.',
    },
    unpinFailed: {
      quiz: 'تعذّر إلغاء تثبيت هذا الاختبار.',
      conversation: 'تعذّر إلغاء تثبيت هذه المحادثة.',
    },
  },

  /* ========================================================================
     notfound
     ======================================================================== */

  notfound: {
    title: 'الصفحة غير موجودة',
    description: 'هذا المسار غير موجود في StudyMate.',
    backToDocuments: 'العودة إلى المستندات',
  },
}
