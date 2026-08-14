import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

import { DocumentParticipantType } from '../enums/document-participant-type.enum';

export class CreateDocumentParticipantDto {
  @IsInt()
  @Min(1)
  userId!: number;

  @IsEnum(DocumentParticipantType)
  participantType!: DocumentParticipantType;

  @IsInt()
  @Min(1)
  order!: number;

  @IsOptional()
  @IsBoolean()
  isPreservedAfterRejection?: boolean;
}

