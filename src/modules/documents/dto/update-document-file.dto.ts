import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { DocumentFileDto } from './document-file.dto';

export class UpdateDocumentFileDto {
  @ValidateNested()
  @Type(() => DocumentFileDto)
  file!: DocumentFileDto;
}
