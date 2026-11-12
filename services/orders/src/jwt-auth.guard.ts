import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { AuthError, extractBearer, type JwtVerifier, type TmsClaims } from '@tms/auth-jwt';
import type { Request } from 'express';

export const JWT_VERIFIER = Symbol('JWT_VERIFIER');

/** La petición, después de pasar el guard, lleva el usuario verificado. */
interface AuthedRequest extends Request {
  user?: TmsClaims;
}

/**
 * Guard de Nest: se ejecuta ANTES de cada handler marcado con @UseGuards(JwtAuthGuard)
 * y decide si la petición pasa (true) o no (lanza 401, o 503 si auth no responde).
 *
 * El gateway ya verificó este token. Lo verificamos OTRA VEZ porque orders no debe confiar
 * en "si llegó hasta aquí, será bueno": si mañana otro servicio interno nos llama directo,
 * o alguien abre un dominio público por error, orders sigue protegido.
 * Cuesta microsegundos (la clave pública está en memoria), así que no hay excusa.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JWT_VERIFIER) private readonly verify: JwtVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    try {
      req.user = await this.verify(extractBearer(req.headers.authorization));
      return true;
    } catch (err) {
      if (err instanceof AuthError) {
        const reason = err.cause instanceof Error ? err.cause.message : err.message;
        console.warn(`[orders] JWT rechazado: ${err.code} (${reason}) id=${req.headers['x-request-id']}`);
        // 401 (token malo) o 503 (no pudimos consultar el JWKS): lo decide AuthError.
        throw new HttpException({ error: err.code, message: err.message }, err.status);
      }
      throw err;
    }
  }
}

/**
 * Decorador de parámetro: `@CurrentUser() user` en un handler entrega los claims verificados.
 * La identidad sale SIEMPRE del token, nunca de una cabecera tipo x-user-id que el cliente
 * podría escribir a mano.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthedRequest>().user;
});
