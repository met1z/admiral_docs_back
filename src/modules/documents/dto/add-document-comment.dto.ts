import { IsString, MinLength } from 'class-validator';

export class AddDocumentCommentDto {
  @IsString()
  @MinLength(1)
  comment!: string;
}
