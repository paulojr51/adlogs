import { IsDateString, IsEnum, IsString } from 'class-validator';
import { FileAction } from '@adlogs/shared';

export class UserActivityDto {
  @IsString()
  username!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class FolderActivityDto {
  @IsString()
  folderPath!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class FolderActionReportDto {
  @IsString()
  folderPath!: string;

  @IsEnum(FileAction)
  action!: FileAction;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
