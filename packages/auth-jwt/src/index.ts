/**
 * @tms/auth-jwt — la única implementación de "¿este token es válido?" del sistema.
 *
 * La usan el gateway (para cortar peticiones malas en la puerta) y cada servicio
 * interno (para no confiar ciegamente en la red). Al vivir en un paquete compartido,
 * las reglas son idénticas en todas partes: mismo algoritmo, mismo emisor, misma audiencia.
 */
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';

/** Los datos que nuestros tokens llevan además de los claims estándar. */
export interface TmsClaims extends JWTPayload {
  /** id del usuario (claim estándar `sub`). */
  sub: string;
  email: string;
  roles: string[];
}

export interface JwtVerifierOptions {
  /** URL del JWKS de auth. En Railway: http://auth.railway.internal:3001/.well-known/jwks.json */
  jwksUrl: string;
  /** Quién emitió el token. Debe coincidir con lo que firma auth. */
  issuer: string;
  /** Para quién es el token. Debe coincidir con lo que firma auth. */
  audience: string;
}

/**
 * Error de autenticación con el código HTTP que corresponde.
 * - 401 = "no sé quién eres": token ausente, falso o vencido. Culpa del cliente.
 * - 503 = "no puedo comprobarlo ahora": no logramos descargar el JWKS de auth. Culpa nuestra.
 * Distinguirlos importa: un 401 le dice al frontend "vuelve a iniciar sesión", y sería
 * injusto echar a todos los usuarios porque auth está reiniciándose.
 */
export type AuthErrorCode = 'missing_token' | 'invalid_token' | 'expired_token' | 'auth_unavailable';

export class AuthError extends Error {
  readonly status: 401 | 503;
  constructor(
    message: string,
    /** Código estable para logs y clientes; nunca el mensaje interno de la librería. */
    readonly code: AuthErrorCode,
    /** El error original (de jose, de red...), para poder loguearlo. */
    cause?: unknown,
  ) {
    super(message, { cause });
    this.status = code === 'auth_unavailable' ? 503 : 401;
  }
}

/** Saca el token de una cabecera `Authorization: Bearer <token>`. */
export function extractBearer(header: string | undefined): string {
  if (!header) throw new AuthError('Falta la cabecera Authorization', 'missing_token');
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AuthError('Se esperaba "Authorization: Bearer <token>"', 'missing_token');
  }
  return token;
}

/**
 * Crea un verificador. Se llama UNA vez al arrancar el servicio y se reutiliza.
 *
 * createRemoteJWKSet descarga las claves públicas la primera vez que hacen falta,
 * las guarda en memoria y solo vuelve a descargar si llega un token con un `kid`
 * desconocido (así funciona la rotación de claves sin redesplegar nada).
 */
export function createJwtVerifier(options: JwtVerifierOptions) {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl));

  return async function verify(token: string): Promise<TmsClaims> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        // Fijamos el algoritmo: un token que diga "alg": "none" o "HS256" se rechaza
        // aunque su firma "cuadre" con otra lógica. No confiamos en lo que el token dice de sí mismo.
        algorithms: ['RS256'],
        issuer: options.issuer,
        audience: options.audience,
        // Tolerancia por relojes ligeramente desfasados entre máquinas.
        clockTolerance: '5s',
      });

      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
        throw new AuthError('El token no trae los datos esperados', 'invalid_token');
      }
      return {
        ...payload,
        sub: payload.sub,
        email: payload.email,
        roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
      };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err instanceof errors.JWTExpired) {
        throw new AuthError('El token venció', 'expired_token', err);
      }
      // No pudimos descargar las claves: auth caído (fetch falla con TypeError),
      // tardó demasiado (JWKSTimeout) o respondió algo que no es un JWKS (JWKSInvalid).
      if (err instanceof TypeError || err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) {
        throw new AuthError('No se pudo verificar el token en este momento', 'auth_unavailable', err);
      }
      // Firma inválida, emisor/audiencia equivocados, token mal formado, kid desconocido...
      // Hacia afuera todo es "token inválido"; el detalle (err) viaja en `cause` para el log.
      throw new AuthError('Token inválido', 'invalid_token', err);
    }
  };
}

export type JwtVerifier = ReturnType<typeof createJwtVerifier>;
