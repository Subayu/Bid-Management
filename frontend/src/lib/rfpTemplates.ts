import type { RFPCreatePayload } from "./api";

export interface RFPTemplate {
  id: string;
  label: string;
  payload: RFPCreatePayload;
}

export const RFP_TEMPLATES: RFPTemplate[] = [
  {
    id: "road-construction",
    label: "Road Construction",
    payload: {
      title: "Road Construction — Resurfacing Project",
      description:
        "Municipal road resurfacing and minor repair work. Scope includes asphalt overlay, crack sealing, and line marking for approximately 12 km of urban roads.",
      requirements:
        "Must have ISO 9001. Minimum 5 years experience in asphalt. Valid contractor license required. Evidence of similar projects in the last 3 years.",
      budget: 450000,
    },
  },
  {
    id: "it-system-upgrade",
    label: "IT System Upgrade",
    payload: {
      title: "IT System Upgrade — Enterprise ERP",
      description:
        "Procurement of enterprise resource planning (ERP) software and implementation services. Cloud or on-premise solution with full support and training.",
      requirements:
        "Vendor must be certified for government deployments. SOC 2 Type II or equivalent. Minimum 3 reference implementations. 24/7 support SLA with 4-hour response.",
      budget: 1200000,
    },
  },
  {
    id: "website-redesign",
    label: "Website Redesign",
    payload: {
      title: "Website Redesign — Fayette County Commission",
      description: `WEBSITE DESIGN
The Fayette County Commission (FCC) seeks a creative, qualified freelance graphic designer, design firm, or agency to establish a new website design for the county government which will allow citizens to efficiently access local government information.

ABOUT FAYETTE COUNTY AND THE COMMISSION
Fayette County is located in Southern West Virginia and is home to the New River Gorge Bridge and the newly established New River Gorge National Park and Preserve. The FCC is the governing body of Fayette County and oversees the financial needs for all county offices.

PROJECT OVERVIEW & SCOPE
The FCC desires an efficient website to allow citizens to access all necessary documents, forms and functions offered and required.

Scope of Work
The scope of the project will extend from concept to creation and include:
• Use current logo and color scheme to develop an updated version of current website content
• Work with commission employees for an efficient and user-friendly layout for citizens
• Train commission employees to update pages as needed
• Transfer site to .gov domain (previously procured)
• Launch site
• Technical support after launch`,
      requirements: `Professional History & Contact Information
Please provide a brief professional history along with the following information:
• Contact person
• Title
• Company name and address
• Company website
• Direct telephone / mobile phone
• Proposal must contain the signature of a duly authorized agent of the company submitting the proposal
• Links to sample websites

Project Summary & Approach
Proposals must include an estimated cost for all work related to the tasks and deliverables outlined in the scope of work. A total estimate for deliverables is required. Proposals should clearly outline how time and cost overruns would be handled, including how the designer or agency alerts the client and negotiates unanticipated changes or delays. All expenses for respondent's preparation and participation in the RFP process, including, but not limited to, interviews, document preparation, communications, presentations, and demonstrations, are entirely the responsibility of the respondent and will not be billable to the FCC.`,
      budget: 75000,
    },
  },
];
