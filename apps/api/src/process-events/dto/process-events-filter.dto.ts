import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ProcessEventsFilterDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  processName?: string;

  @IsOptional()
  @IsString()
  serverId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
