import { IsString, MinLength } from 'class-validator';

export class UpdateDocumentNameDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

