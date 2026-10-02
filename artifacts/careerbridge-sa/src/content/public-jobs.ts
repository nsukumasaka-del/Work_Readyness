export type PublicJobCategory = {
  slug: string;
  name: string;
  title: string;
  description: string;
  overview: string[];
  roles: string[];
  skills: string[];
  applicationTips: string[];
};

export const PUBLIC_JOB_CATEGORIES: PublicJobCategory[] = [
  {
    slug: 'administration',
    name: 'Administration',
    title: 'Administration Jobs in South Africa',
    description: 'Prepare for administration vacancies with guidance on common roles, useful skills and stronger applications.',
    overview: [
      'Administration work supports records, schedules, communication and the day-to-day flow of an organisation. Titles vary widely, so compare the actual responsibilities rather than applying by title alone.',
      'A strong application makes your accuracy, organisation and systems experience easy to verify. Mention the documents, processes and software you have genuinely used.',
    ],
    roles: ['Administrative Assistant', 'Office Administrator', 'Data Capturer', 'Receptionist', 'Operations Administrator'],
    skills: ['Document control', 'Calendar coordination', 'Microsoft Office', 'Data accuracy', 'Customer communication'],
    applicationTips: ['Name the systems you have used.', 'Show how you maintained accurate records.', 'Include examples of coordinating deadlines or requests.'],
  },
  {
    slug: 'customer-service',
    name: 'Customer Service',
    title: 'Customer Service Jobs in South Africa',
    description: 'Explore customer-service career paths and prepare a CV that demonstrates communication, resolution and service skills.',
    overview: [
      'Customer-service roles can involve calls, email, chat, face-to-face assistance or account support. Employers usually need evidence that you can understand a request, communicate clearly and follow a matter through.',
      'Your CV should describe the customers you supported, the channels and systems you used, and how you handled difficult or urgent enquiries without inventing performance claims.',
    ],
    roles: ['Customer Service Representative', 'Call Centre Agent', 'Client Support Consultant', 'Customer Care Agent', 'Service Desk Assistant'],
    skills: ['Clear communication', 'Query resolution', 'CRM use', 'Escalation handling', 'Accurate record keeping'],
    applicationTips: ['Describe the service channels you handled.', 'Explain your approach to complaints and escalation.', 'Include relevant CRM or ticketing systems.'],
  },
  {
    slug: 'logistics',
    name: 'Logistics',
    title: 'Logistics Jobs in South Africa',
    description: 'Understand common logistics roles and present transport, warehouse, import or supply-chain experience clearly.',
    overview: [
      'Logistics work connects orders, stock, transport, documentation and delivery. Vacancies may focus on coordination, warehousing, freight, procurement or supply-chain reporting.',
      'Applications are stronger when they show the type of operation, documents, systems and stakeholders involved. Accuracy and dependable follow-through are often as important as the job title.',
    ],
    roles: ['Logistics Coordinator', 'Dispatch Clerk', 'Warehouse Administrator', 'Import and Export Controller', 'Supply Chain Assistant'],
    skills: ['Shipment tracking', 'Dispatch documentation', 'Inventory records', 'Carrier coordination', 'ERP or warehouse systems'],
    applicationTips: ['State the transport or warehouse environment.', 'Mention verified import, export or customs exposure.', 'Show how you tracked exceptions and deadlines.'],
  },
  {
    slug: 'sales',
    name: 'Sales',
    title: 'Sales Jobs in South Africa',
    description: 'Prepare for sales vacancies with practical guidance on customer needs, pipelines, products and evidence-based results.',
    overview: [
      'Sales roles range from retail and telesales to account management and business development. Read the vacancy carefully to understand the product, customer and sales cycle.',
      'Use accurate evidence when describing targets or revenue. If exact figures are confidential or unavailable, explain the activities, customer groups and responsibilities without fabricating numbers.',
    ],
    roles: ['Sales Consultant', 'Account Executive', 'Business Development Representative', 'Retail Sales Assistant', 'Internal Sales Coordinator'],
    skills: ['Needs discovery', 'Product knowledge', 'Pipeline follow-up', 'Proposal preparation', 'Customer relationship management'],
    applicationTips: ['Identify the products or services you sold.', 'Describe your customer segment and sales channel.', 'Use performance figures only when accurate.'],
  },
  {
    slug: 'finance',
    name: 'Finance',
    title: 'Finance Jobs in South Africa',
    description: 'Prepare accurate applications for finance, accounting, bookkeeping and credit-control opportunities.',
    overview: [
      'Finance vacancies require careful attention to qualifications, responsibilities and the systems used by the employer. Entry requirements differ substantially between clerical, bookkeeping and professionally regulated roles.',
      'Make your level of responsibility clear. Distinguish between capturing, reconciliation, reporting, analysis and formal sign-off, and never imply a qualification or registration you do not hold.',
    ],
    roles: ['Accounts Clerk', 'Bookkeeper', 'Credit Controller', 'Payroll Administrator', 'Junior Financial Analyst'],
    skills: ['Reconciliations', 'Invoice processing', 'Spreadsheet accuracy', 'Accounting software', 'Financial record keeping'],
    applicationTips: ['List relevant qualifications accurately.', 'Name accounting systems you have used.', 'Explain the records or reconciliations you handled.'],
  },
  {
    slug: 'it',
    name: 'Information Technology',
    title: 'IT Jobs in South Africa',
    description: 'Explore IT role families and learn how to present technical skills, projects and support experience truthfully.',
    overview: [
      'Information-technology roles include support, infrastructure, development, data, testing and security. Focus your application on the role family instead of listing every technology you have encountered.',
      'Technical evidence can come from employment, verified training, portfolios or substantial projects. Explain what you built, supported or improved and be precise about your level of involvement.',
    ],
    roles: ['IT Support Technician', 'Software Developer', 'Systems Administrator', 'Data Analyst', 'Quality Assurance Tester'],
    skills: ['Troubleshooting', 'Technical documentation', 'Version control', 'Data handling', 'User support'],
    applicationTips: ['Link to relevant, current work where appropriate.', 'Separate confident skills from limited exposure.', 'Describe your contribution to projects clearly.'],
  },
];

export function findPublicJobCategory(slug?: string) {
  return PUBLIC_JOB_CATEGORIES.find((category) => category.slug === slug);
}
