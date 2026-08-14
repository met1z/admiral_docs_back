import { IsInt, IsString, Min } from 'class-validator';

export class DocumentFileDto {
  @IsString()
  mimeType!: string;

  @IsString()
  url!: string;

  @IsString()
  storageKey!: string;

  @IsString()
  originalFileName!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
