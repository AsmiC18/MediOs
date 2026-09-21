import { BadRequestException } from '@nestjs/common';

export function validateVitalSigns(input: {
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  systolicBp?: number;
  diastolicBp?: number;
  oxygenSaturation?: number;
  painScore?: number;
}): void {
  if (input.temperature !== undefined) {
    if (input.temperature < 30 || input.temperature > 45) {
      throw new BadRequestException('Temperature must be between 30 and 45');
    }
  }

  if (input.heartRate !== undefined) {
    if (input.heartRate < 1 || input.heartRate > 300) {
      throw new BadRequestException('Heart rate must be between 1 and 300');
    }
  }

  if (input.respiratoryRate !== undefined) {
    if (input.respiratoryRate < 1 || input.respiratoryRate > 100) {
      throw new BadRequestException('Respiratory rate must be between 1 and 100');
    }
  }

  if (input.systolicBp !== undefined) {
    if (input.systolicBp < 50 || input.systolicBp > 300) {
      throw new BadRequestException('Systolic BP must be between 50 and 300');
    }
  }

  if (input.diastolicBp !== undefined) {
    if (input.diastolicBp < 30 || input.diastolicBp > 200) {
      throw new BadRequestException('Diastolic BP must be between 30 and 200');
    }
  }

  if (input.oxygenSaturation !== undefined) {
    if (input.oxygenSaturation < 0 || input.oxygenSaturation > 100) {
      throw new BadRequestException('Oxygen saturation must be between 0 and 100');
    }
  }

  if (input.painScore !== undefined) {
    if (input.painScore < 0 || input.painScore > 10) {
      throw new BadRequestException('Pain score must be between 0 and 10');
    }
  }
}
