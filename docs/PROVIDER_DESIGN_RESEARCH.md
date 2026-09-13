# Provider design research

Last reviewed: 2026-09-13

This document separates provider visual language from page composition. Provider presets are immutable system configuration; administrators choose a provider and a layout, not provider artwork. These pages are document/access workflows and must never imitate a provider credential form.

## Microsoft 365

- Official design system: [Fluent 2 design principles](https://fluent2.microsoft.design/design-principles), [layout](https://fluent2.microsoft.design/layout), [typography](https://fluent2.microsoft.design/typography), and [color](https://fluent2.microsoft.design/color).
- Official identity source: [Microsoft identity-platform branding guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps) and [Microsoft trademark guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks).
- Typography: Segoe UI / Segoe UI Variable first. Fluent recommends left alignment for left-to-right text and semantic, scannable type roles.
- Spacing: Fluent’s four-pixel base ramp; use proximity and whitespace for grouping before borders.
- Color and surfaces: neutral white/gray surfaces with product/brand color used selectively. Microsoft explicitly warns that broad brand-color use weakens hierarchy.
- Asset source: the unmodified Microsoft 365 48px Fluent product icon from Microsoft’s versioned Office CDN (`fabric-cdn-prod_20251008.001`), stored at `public/providers/microsoft365/microsoft365.svg`.
- Logo: the local asset is rendered at 36px or less, at intrinsic proportions, beside the product name. Do not recolor, rearrange, append artwork, or imply endorsement.
- Documents/files: use functional file identity and metadata; Microsoft’s web-integration guidance distinguishes file-type icons from product/app icons.
- Actions: one clear primary action, sentence-case labels, restrained radius and elevation.
- Avoid: full-page blue, gradients, marketing headlines, fake Microsoft fields, “Microsoft 365 ID,” Azure/Active Directory terminology for end users, and altered marks.

## SharePoint

- Official system sources: Fluent 2 sources above, [SharePoint Brand Center](https://learn.microsoft.com/en-us/sharepoint/brand-center-overview), and [Microsoft 365 web integration UI guidance](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/build-test-ship/ui-guidelines).
- Typography/spacing: Segoe UI and the Fluent four-pixel rhythm.
- Visual treatment: neutral site/workspace surface, compact site identity, structured resource cards and lists, selective teal accent.
- Asset source: the unmodified SharePoint 48px Fluent product icon from Microsoft’s versioned Office CDN, stored at `public/providers/sharepoint/sharepoint.svg`.
- Logo: use functionally for the selected SharePoint workflow, at intrinsic proportions and restrained size. Microsoft requires product icons to remain current.
- Content pattern: workspace/resource name first; documents, lists, and files should carry more visual weight than provider identity.
- Avoid: a generic centered authorization card, decorative app icons, oversized site headers, and broad teal surfaces.

## OneDrive

- Official system sources: Fluent 2 and the Microsoft web-integration guidance linked above.
- Typography/spacing: Segoe UI, left-aligned file information, four-pixel spacing ramp.
- Visual treatment: file/folder object first, neutral surfaces, selective OneDrive blue, subtle border/elevation.
- Asset source: the unmodified OneDrive 48px Fluent product icon from Microsoft’s versioned Office CDN, stored at `public/providers/onedrive/onedrive.svg`.
- Logo: use functionally for the selected OneDrive workflow, at intrinsic proportions and restrained size. Do not fabricate or recolor the cloud mark.
- File pattern: filename, type, size, page count, sharing/sender status, then access controls.
- Avoid: large cloud branding, marketing copy, generic “workspace” language, or hiding the file below authorization content.

## Adobe Acrobat Sign

- Official design system: [Spectrum 2](https://s2.spectrum.adobe.com/) and Spectrum’s [design tokens](https://spectrum.adobe.com/page/design-tokens/), [typography](https://spectrum.adobe.com/page/typography/), and [spacing](https://spectrum.adobe.com/page/spacing/).
- Official brand/legal source: [Adobe trademark guidance](https://www.adobe.com/legal/permissions/trademarks.html), [icons and web-logo guidance](https://www.adobe.com/legal/permissions/icons-web-logos.html), and [Adobe developer branding guidance](https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/branding-guidelines).
- Typography/spacing: Spectrum is token-driven, adaptive, accessible, and context-sensitive. Adobe’s exact proprietary product typefaces are not bundled; use a conservative system sans stack.
- Visual treatment: editorial document hierarchy, precise neutral surfaces, restrained red accent, low visual noise.
- Asset source: Adobe’s official 32×32 PDF file icon from its legal permissions page, stored unmodified at `public/providers/adobe/pdf-file-icon.png`.
- Logo boundary: Adobe states that corporate and Acrobat/Acrobat Sign product logos require prior written permission. The PDF icon is therefore used only as PDF file identity, with its required clear space; the adjacent product name remains text. A licensed operator can replace this system asset in a code release after confirming rights.
- Document pattern: agreement/filename and practical metadata first, dominant page preview, signature/verification status, then authorization.
- Avoid: an invented Adobe “A,” large red backgrounds, fake Acrobat sign-in forms, product imagery copied from Adobe, or implying sponsorship.

## Docusign

- Official sources: [Docusign brand guidelines](https://brand.docusign.com/), [logo](https://brand.docusign.com/logo), [typography](https://brand.docusign.com/typography), [color](https://brand.docusign.com/color), and [public brand assets](https://brand.docusign.com/resources).
- Typography: Docusign Indigo is proprietary. The application uses a conservative grotesque/system fallback while preserving sentence case, readable line lengths, and restrained weights.
- Spacing/surfaces: agreement-centric, high-confidence, uncluttered; mostly white or warm neutral surfaces with Inkwell text and Cobalt as an accent.
- Asset source: the current full-color Nexus + Wordmark lockup from Docusign’s public brand site, stored at `public/providers/docusign/docusign.svg`.
- Logo: the official Nexus icon and wordmark must always stay together, may not be redrawn/recolored/stretched, and has a 52px minimum width. The local asset is rendered at its intrinsic aspect ratio. Docusign’s trademark guide says operators without an existing license should request one from `brand@docusign.com`.
- Document pattern: agreement name, sender/recipient, status, and summary first; provider identity is secondary.
- Actions: one strong agreement/access action with direct language.
- Avoid: separating icon and wordmark, adding shadows/strokes, all-uppercase copy, arbitrary purple recoloring, or marketing slogans.

## Conservative fallback and legal boundary

“Officially available” does not mean every third party automatically has permission to redistribute every product logo. Microsoft and Adobe both reserve uses that require a license. The application therefore:

1. bundles current Microsoft Fluent product icons from Microsoft’s public versioned CDN, Adobe’s narrowly permitted PDF file icon, and Docusign’s public brand lockup;
2. does not represent the Adobe PDF file icon as an Acrobat/Acrobat Sign product logo;
3. never fabricates, traces, recolors, or recomposes provider marks;
4. keeps provider assets immutable and outside company/project logo libraries;
5. lets the operator replace system assets only through a code/configuration release after confirming licensing—not through the normal page builder.

Company logos remain a separate optional brand layer managed in Settings → Brand Assets.
