export const htmlTemplates = {
  employee_connection: {
    name: "Employee Microsoft Connection",
    html: `<main class="hero"><span class="eyebrow">Secure company access</span><h1>Connect your Microsoft 365 account</h1><p>Your sign-in takes place only on Microsoft's official website. This page never asks for your Microsoft password.</p><a class="button" href="{{CONNECTION_URL}}">Continue to connection instructions</a></main>`,
  },
  company_notice: {
    name: "Internal Company Notice",
    html: `<main class="document"><span class="eyebrow">Company update</span><h1>Important internal notice</h1><p class="lead">Add a concise summary for employees here.</p><section class="card"><h2>What you need to know</h2><p>Replace this text with approved company information.</p></section></main>`,
  },
  sharepoint_resource: {
    name: "SharePoint Resource Page",
    html: `<main class="document"><span class="eyebrow">Company resources</span><h1>Project resources</h1><p class="lead">Use official SharePoint links to help employees find permitted documents.</p><section class="card"><h2>Documents</h2><a class="button" href="https://company.sharepoint.com/">Open SharePoint</a></section></main>`,
  },
  signing_instructions: {
    name: "Document Signing Instructions",
    html: `<main class="document"><span class="eyebrow">Document workflow</span><h1>Review and sign your document</h1><ol class="steps"><li>Open the official signing request sent by the provider.</li><li>Review the document and identity information.</li><li>Complete signing on Adobe Acrobat Sign or DocuSign.</li></ol><p>This page never requests your signing-service password.</p></main>`,
  },
  support_request: {
    name: "Support Request",
    html: `<main class="document"><span class="eyebrow">Employee support</span><h1>How can we help?</h1><form class="card"><label>Full name<input name="name" autocomplete="name"></label><label>Work email<input type="email" name="email" autocomplete="email"></label><label>Request details<textarea name="details" rows="5"></textarea></label><button type="submit">Submit request</button></form></main>`,
  },
  landing_page: {
    name: "General Landing Page",
    html: `<main class="hero"><span class="eyebrow">Welcome</span><h1>Build a clear company landing page</h1><p>Describe the resource, campaign, or employee workflow here.</p><a class="button" href="#details">Learn more</a><section id="details" class="card"><h2>Details</h2><p>Add approved content.</p></section></main>`,
  },
  blank: { name: "Blank Page", html: `<main class="document"><h1>Untitled page</h1><p>Start creating your content.</p></main>` },
} as const;

export const defaultProjectCss = `:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}.hero,.document{max-width:900px;margin:auto;padding:clamp(3rem,8vw,7rem) 1.5rem}.hero{text-align:center}.eyebrow{color:#3157d5;font-weight:700;text-transform:uppercase;letter-spacing:.1em;font-size:.75rem}h1{font-size:clamp(2.2rem,6vw,4.5rem);line-height:1.05;letter-spacing:-.04em;margin:1rem 0}h2{font-size:1.4rem}p,.lead{color:#5e687d;font-size:1.08rem;line-height:1.7}.button,button{display:inline-block;border:0;border-radius:10px;background:#3157d5;color:white;padding:.85rem 1.15rem;text-decoration:none;font-weight:700}.card{margin-top:2rem;padding:1.5rem;border:1px solid #dce3ef;border-radius:16px;background:white;text-align:left;box-shadow:0 12px 40px #22336610}label{display:grid;gap:.4rem;margin:.8rem 0;font-weight:600}input,textarea{padding:.75rem;border:1px solid #ccd5e4;border-radius:8px;font:inherit}.steps{display:grid;gap:1rem;text-align:left;line-height:1.6}`;
