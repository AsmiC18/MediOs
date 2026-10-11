import { UpsertSoapDto } from '../dto/upsert-soap.dto';

export type SoapContent = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
};

export function soapContentFromDto(dto: UpsertSoapDto): SoapContent {
  return {
    subjective: dto.subjective ?? null,
    objective: dto.objective ?? null,
    assessment: dto.assessment ?? null,
    plan: dto.plan ?? null,
  };
}

export function soapContentFromNote(note: {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
}): SoapContent {
  return {
    subjective: note.subjective ?? null,
    objective: note.objective ?? null,
    assessment: note.assessment ?? null,
    plan: note.plan ?? null,
  };
}

export function mergeSoapContent(
  existing: SoapContent,
  dto: UpsertSoapDto,
): SoapContent {
  return {
    subjective:
      dto.subjective !== undefined ? dto.subjective : existing.subjective,
    objective: dto.objective !== undefined ? dto.objective : existing.objective,
    assessment:
      dto.assessment !== undefined ? dto.assessment : existing.assessment,
    plan: dto.plan !== undefined ? dto.plan : existing.plan,
  };
}

export function areSoapContentsEqual(a: SoapContent, b: SoapContent): boolean {
  return (
    a.subjective === b.subjective &&
    a.objective === b.objective &&
    a.assessment === b.assessment &&
    a.plan === b.plan
  );
}

export function soapContentToWriteData(content: SoapContent) {
  return {
    subjective: content.subjective,
    objective: content.objective,
    assessment: content.assessment,
    plan: content.plan,
  };
}
