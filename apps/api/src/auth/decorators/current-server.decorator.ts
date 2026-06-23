import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Server } from '@adlogs/shared';

export const CurrentServer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Server => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return request['server'] as Server;
  },
);
