import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { DocumentStatus } from '../enums/document-status.enum';

export enum DocumentSortBy {
  CREATED_AT = 'created_at',
  NAME = 'name',
  CREATOR_NAME = 'creator_name',
  STATUS = 'status',
  REVISION_TYPE = 'revision_type',
}

export class DocumentQueryDto {
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  typeId?: number;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  creatorName?: string;

  @IsOptional()
  @IsIn(['new', 'repeat'])
  revisionType?: 'new' | 'repeat';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(DocumentSortBy)
  sortBy?: DocumentSortBy;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection?: 'ASC' | 'DESC';
}
