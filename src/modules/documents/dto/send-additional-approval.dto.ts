import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class SendAdditionalApprovalDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds!: number[];

  @IsOptional()
  @IsString()
  message?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
