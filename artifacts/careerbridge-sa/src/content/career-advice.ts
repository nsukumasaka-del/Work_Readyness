export type AdviceCategory = 'CV Advice' | 'Job Search' | 'Interviews' | 'Cover Letters' | 'Career Development' | 'Workplace Advice';

export type AdviceSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: string;
};

export type CareerArticle = {
  slug: string;
  title: string;
  excerpt: string;
  category: AdviceCategory;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  seoTitle: string;
  metaDescription: string;
  sections: AdviceSection[];
  faqs: Array<{ question: string; answer: string }>;
  relatedSlugs: string[];
};

export const ADVICE_CATEGORIES: AdviceCategory[] = [
  'CV Advice',
  'Job Search',
  'Interviews',
  'Cover Letters',
  'Career Development',
  'Workplace Advice',
];

export const CAREER_ARTICLES: CareerArticle[] = [
  {
    slug: 'how-to-write-a-cv-in-south-africa',
    title: 'How to Write a CV in South Africa',
    excerpt: 'A practical guide to structuring a clear, truthful CV for South African employers and recruitment systems.',
    category: 'CV Advice',
    publishedAt: '2026-10-02',
    updatedAt: '2026-10-02',
    readingMinutes: 8,
    seoTitle: 'How to Write a CV in South Africa | BonList',
    metaDescription: 'Learn how to write a clear South African CV, including contact details, professional summary, work history, education, skills and references.',
    sections: [
      {
        id: 'start-with-the-role',
        heading: 'Start with the role you want',
        paragraphs: [
          'A useful CV is written for a type of role, not for every vacancy at once. Before editing, identify the job title, seniority level and the work the employer needs completed.',
          'Read the advert carefully and note recurring responsibilities, required systems and essential qualifications. Use the employer’s language where it accurately describes your experience, but never add skills or achievements you cannot support.',
        ],
        callout: 'Keep a complete master CV, then create a focused version for each serious application.',
      },
      {
        id: 'contact-details',
        heading: 'Use practical contact details',
        paragraphs: ['Place your name, professional title, phone number, email address and city or province near the top. A LinkedIn profile or portfolio can help when it is current and relevant.'],
        bullets: [
          'Use an email address you check regularly.',
          'State a broad location such as Johannesburg or Gauteng; a full street address is usually unnecessary.',
          'Do not include an identity number, banking information, marital status or other sensitive details.',
          'Check that every link opens correctly before sending the CV.',
        ],
      },
      {
        id: 'professional-summary',
        heading: 'Write a focused professional summary',
        paragraphs: [
          'Use three or four concise lines to explain your experience, strongest relevant capabilities and the value you can bring. Replace generic claims such as “hard-working team player” with specific areas of work you have handled.',
          'If you are entering the workforce, focus on training, projects, volunteering, practical coursework and transferable strengths rather than apologising for limited experience.',
        ],
      },
      {
        id: 'work-experience',
        heading: 'Show evidence in your work history',
        paragraphs: ['List recent and relevant roles first. For each role, include the job title, employer, dates and short achievement-focused bullets. Explain what you did, how you did it and what improved when that information is known.'],
        bullets: [
          'Begin bullets with clear verbs such as coordinated, resolved, prepared, maintained or improved.',
          'Include numbers only when they are accurate and can be explained.',
          'Prioritise responsibilities connected to the vacancy.',
          'Use consistent date formatting throughout the document.',
        ],
      },
      {
        id: 'education-skills',
        heading: 'Keep education and skills easy to verify',
        paragraphs: [
          'Name the qualification, institution and completion year or current status. Add short courses and licences only when they are relevant or strengthen your application.',
          'Group skills into useful areas such as software, administration, customer service, technical capabilities or languages. Avoid long lists of vague traits that are not supported elsewhere in the CV.',
        ],
      },
      {
        id: 'final-check',
        heading: 'Complete a final application check',
        paragraphs: ['Read the finished CV as both a recruiter and an automated system would. The document should be easy to scan, factually accurate and specific to the vacancy.'],
        bullets: [
          'Check spelling, dates, phone numbers and links.',
          'Use clear headings and readable font sizes.',
          'Save a PDF unless the employer requests another format.',
          'Use a sensible filename such as Name-Surname-CV.pdf.',
        ],
      },
    ],
    faqs: [
      { question: 'Should a South African CV include an ID number?', answer: 'Usually no. An identity number is sensitive personal information and is not necessary on a general application CV unless a legitimate, verified process specifically requires it later.' },
      { question: 'Do I need to include references?', answer: 'Follow the vacancy instructions. You can list relevant referees with permission, write “Available on request”, or omit the section when space is limited.' },
      { question: 'Should I add a photograph?', answer: 'A photograph is normally unnecessary unless the role or application instructions genuinely require one. Keep the CV focused on relevant qualifications and evidence.' },
    ],
    relatedSlugs: ['how-to-make-your-cv-ats-friendly', 'how-to-improve-a-cv-without-lying'],
  },
  {
    slug: 'how-to-make-your-cv-ats-friendly',
    title: 'How to Make Your CV ATS Friendly',
    excerpt: 'Make your CV easier for applicant tracking systems and recruiters to read without sacrificing accuracy or personality.',
    category: 'CV Advice',
    publishedAt: '2026-10-02',
    updatedAt: '2026-10-02',
    readingMinutes: 7,
    seoTitle: 'How to Make Your CV ATS Friendly | BonList',
    metaDescription: 'Practical ATS CV guidance covering headings, keywords, layout, file formats and truthful tailoring for job applications.',
    sections: [
      {
        id: 'what-ats-does',
        heading: 'Understand what an ATS does',
        paragraphs: ['An applicant tracking system helps employers receive, organise and search applications. Different systems work differently, so no layout can guarantee a result. Your safest approach is a clear structure with meaningful text that also reads well for a person.'],
      },
      {
        id: 'clear-structure',
        heading: 'Use a clear document structure',
        paragraphs: ['Use familiar headings so work history, education and skills can be identified easily. Keep related information together and avoid placing essential details only inside decorative graphics.'],
        bullets: [
          'Professional Summary',
          'Work Experience',
          'Education',
          'Skills',
          'Certifications or Projects when relevant',
        ],
      },
      {
        id: 'keywords',
        heading: 'Match relevant wording truthfully',
        paragraphs: [
          'Compare the advert with your CV and identify important role names, systems, licences and responsibilities. Use an exact term when it truthfully matches your experience. For example, write the name of a CRM or accounting package you have actually used rather than only saying “computer literate”.',
          'Do not paste a hidden job description into the document or repeat keywords unnaturally. Keyword stuffing makes the CV harder to read and can undermine trust.',
        ],
      },
      {
        id: 'formatting',
        heading: 'Choose dependable formatting',
        paragraphs: ['Use readable fonts, consistent spacing and conventional bullets. Tables, text boxes and multi-column designs can work in some systems, but a simpler version is useful when an employer’s upload instructions are unclear.'],
        callout: 'Always open the exported file and copy a section into plain text. If the reading order is confusing, simplify the layout.',
      },
      {
        id: 'file-check',
        heading: 'Check the file before submitting',
        paragraphs: ['Follow the employer’s requested file type. PDF usually preserves layout, while some portals specifically request Word documents. Confirm that the file is not password-protected and that its text can be selected.'],
        bullets: [
          'Use a descriptive filename.',
          'Remove tracked changes and comments.',
          'Confirm that dates and headings are consistent.',
          'Check the application preview after uploading.',
        ],
      },
    ],
    faqs: [
      { question: 'Does an ATS automatically reject every CV with columns?', answer: 'No. Systems vary. Columns can affect reading order in some workflows, so keep essential information clear and test the exported text.' },
      { question: 'Should I copy every keyword from the advert?', answer: 'No. Include terms that genuinely describe your background. Unsupported keywords can create problems during screening or interviews.' },
      { question: 'Is PDF always the best file type?', answer: 'Not always. Use the format requested by the employer. When no format is specified, a text-based PDF is often practical, but verify that the portal reads it correctly.' },
    ],
    relatedSlugs: ['how-to-write-a-cv-in-south-africa', 'how-to-improve-a-cv-without-lying'],
  },
  {
    slug: 'how-to-improve-a-cv-without-lying',
    title: 'How to Improve a CV Without Lying',
    excerpt: 'Strengthen weak wording, explain real contributions and tailor your CV while keeping every claim accurate.',
    category: 'Career Development',
    publishedAt: '2026-10-02',
    updatedAt: '2026-10-02',
    readingMinutes: 6,
    seoTitle: 'How to Improve a CV Without Lying | BonList',
    metaDescription: 'Learn how to make your CV stronger through clear evidence, accurate achievements and truthful tailoring without inventing experience.',
    sections: [
      {
        id: 'strong-is-not-exaggerated',
        heading: 'Strong wording is not the same as exaggeration',
        paragraphs: ['You do not need to invent seniority, qualifications or results to sound professional. Strong CV writing makes the real scope of your work clear. It replaces vague phrases with accurate actions, context and outcomes.'],
      },
      {
        id: 'recover-evidence',
        heading: 'Recover evidence from your everyday work',
        paragraphs: ['Think through a normal week in each role. Consider the customers, systems, records, deadlines, problems and colleagues involved. These details often reveal valuable work that a short job title does not show.'],
        bullets: [
          'What did people rely on you to complete?',
          'Which problems did you resolve or prevent?',
          'Which tools, systems or documents did you use?',
          'What changed after your action?',
          'Which facts could a former manager confirm?',
        ],
      },
      {
        id: 'rewrite',
        heading: 'Rewrite duties as clear contributions',
        paragraphs: ['A duty such as “answered phones” can become “Handled customer calls, captured accurate enquiry details and directed urgent matters to the correct team.” This is stronger because it explains the work, not because it adds an invented result.'],
        callout: 'If a number, qualification or system cannot be supported, leave it out or describe the contribution without it.',
      },
      {
        id: 'tailor',
        heading: 'Tailor by selecting, not inventing',
        paragraphs: ['Tailoring means moving the most relevant truthful information higher, choosing examples that match the vacancy and using accurate terminology from the advert. It does not mean rewriting your history to become a different person.'],
      },
      {
        id: 'gaps',
        heading: 'Handle gaps and transitions directly',
        paragraphs: ['Use accurate dates and be ready with a short, honest explanation. Relevant training, caregiving, temporary work, volunteering or independent projects may help explain a period when they are real. Avoid fictional employers or altered dates.'],
      },
    ],
    faqs: [
      { question: 'Can I change my job title on my CV?', answer: 'Keep the official title or use a truthful clarifier when the internal title is unclear. Do not promote yourself to a level you did not hold.' },
      { question: 'What if I do not know exact performance numbers?', answer: 'Describe the scope and outcome without inventing figures. Accurate qualitative evidence is better than an unsupported percentage.' },
      { question: 'Can AI rewrite my CV?', answer: 'AI can help clarify wording, but you should verify every statement, date, skill and result before using it.' },
    ],
    relatedSlugs: ['how-to-write-a-cv-in-south-africa', 'how-to-make-your-cv-ats-friendly'],
  },
  {
    slug: 'how-to-identify-fake-job-advertisements',
    title: 'How to Identify Fake Job Advertisements',
    excerpt: 'Recognise common recruitment scam warning signs and verify opportunities before sharing personal information or money.',
    category: 'Job Search',
    publishedAt: '2026-10-02',
    updatedAt: '2026-10-02',
    readingMinutes: 7,
    seoTitle: 'How to Identify Fake Job Advertisements | BonList',
    metaDescription: 'Learn how to check job advertisements, recruiter identities, application links and payment requests before sharing personal information.',
    sections: [
      {
        id: 'pause',
        heading: 'Pause when the offer creates pressure',
        paragraphs: ['Scammers often push applicants to act before checking the details. Be cautious when a message promises immediate employment, unusually high pay for vague work, or demands a response within minutes. A legitimate employer should allow reasonable verification.'],
      },
      {
        id: 'verify-employer',
        heading: 'Verify the employer independently',
        paragraphs: ['Find the organisation’s official website yourself rather than trusting only the supplied link. Compare the vacancy, email domain, phone number and recruiter name with information published through official channels.'],
        bullets: [
          'Search the organisation’s official careers page.',
          'Check whether the email domain matches the real organisation.',
          'Contact the organisation using details you found independently.',
          'Look for a complete role description and credible application process.',
        ],
      },
      {
        id: 'money',
        heading: 'Do not pay to receive a job offer',
        paragraphs: ['Treat requests for placement fees, equipment deposits, training payments, background-check payments or transport money with extreme caution. Verify any cost directly with the organisation before proceeding. Never share card PINs or online-banking credentials.'],
        callout: 'A job application should not require you to send money to an unknown individual to secure the role.',
      },
      {
        id: 'personal-information',
        heading: 'Limit personal information during the application',
        paragraphs: ['A normal first application may require your CV and contact details. It should not require banking passwords, one-time PINs or unrestricted copies of sensitive documents through an unverified chat account. Share additional documents only through a verified process when there is a legitimate reason.'],
      },
      {
        id: 'what-to-do',
        heading: 'What to do when something feels wrong',
        paragraphs: ['Stop communicating, keep copies of messages and links, and verify the organisation independently. If you already shared credentials or payment information, contact the relevant bank or service provider promptly and use official South African reporting channels appropriate to the incident.'],
      },
    ],
    faqs: [
      { question: 'Is a WhatsApp job offer always fake?', answer: 'No, but the platform alone does not prove legitimacy. Verify the person, employer, vacancy and application process independently.' },
      { question: 'Can an employer ask for identity documents?', answer: 'There can be legitimate reasons later in a verified recruitment or employment process. Be cautious when an unknown person requests sensitive documents before the role and organisation have been verified.' },
      { question: 'What if the company logo looks genuine?', answer: 'Logos and documents can be copied. Verify the vacancy using contact details and websites you locate independently.' },
    ],
    relatedSlugs: ['how-to-write-a-cv-in-south-africa'],
  },
];

export function findCareerArticle(slug?: string) {
  return CAREER_ARTICLES.find((article) => article.slug === slug);
}

export function adviceCategorySlug(category: AdviceCategory) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
