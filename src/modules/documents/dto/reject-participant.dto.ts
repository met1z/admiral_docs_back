import { IsOptional, IsString, MinLength } from 'class-validator';

export class RejectParticipantDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  message?: string;
}

