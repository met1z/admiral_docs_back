import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CreateDocumentParticipantDto } from './create-document-participant.dto';
import { DocumentFileDto } from './document-file.dto';

export class CreateDocumentDto {
  @IsInt()
  @Min(1)
  typeId!: number;

  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => DocumentFileDto)
  file!: DocumentFileDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentParticipantDto)
  participants!: CreateDocumentParticipantDto[];
}

