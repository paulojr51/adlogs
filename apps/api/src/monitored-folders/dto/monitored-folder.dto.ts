import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMonitoredFolderDto {
  @IsString()
  path!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateMonitoredFolderDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
