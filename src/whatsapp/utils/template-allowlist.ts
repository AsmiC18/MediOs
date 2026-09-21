export type TemplateAllowlistEntry = {
  params: number;
  languages: string[];
  maxParamLength?: number;
};

export const WHATSAPP_TEMPLATE_ALLOWLIST: Record<string, TemplateAllowlistEntry> =
  {
    appointment_confirmation: {
      params: 3,
      languages: ['en', 'hi'],
    },
    payment_reminder: {
      params: 2,
      languages: ['en'],
    },
  };

export function validateTemplateRequest(input: {
  templateName: string;
  languageCode: string;
  parameters: string[];
}): void {
  const entry = WHATSAPP_TEMPLATE_ALLOWLIST[input.templateName];

  if (!entry) {
    throw new Error(`Template "${input.templateName}" is not allowed`);
  }

  if (!entry.languages.includes(input.languageCode)) {
    throw new Error(
      `Language "${input.languageCode}" is not allowed for template "${input.templateName}"`,
    );
  }

  if (input.parameters.length !== entry.params) {
    throw new Error(
      `Template "${input.templateName}" requires exactly ${entry.params} parameters`,
    );
  }

  const maxParamLength = entry.maxParamLength ?? 256;

  for (const parameter of input.parameters) {
    if (typeof parameter !== 'string' || parameter.trim().length === 0) {
      throw new Error('Template parameters must be non-empty strings');
    }

    if (parameter.length > maxParamLength) {
      throw new Error(
        `Template parameter exceeds maximum length of ${maxParamLength}`,
      );
    }
  }
}
