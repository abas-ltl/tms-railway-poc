import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { AUTH_CONFIG, type AuthConfig } from './config.js';
import { SIGNING_KEYS, type SigningKeys } from './signing-keys.js';
import type { UserRow } from './users.repository.js';

/** Emite los access tokens. Es lo ÚNICO del sistema que usa la clave privada. */
@Injectable()
export class TokensService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
  ) {}

  async issueAccessToken(user: UserRow): Promise<string> {
    return new SignJWT({ email: user.email, roles: user.roles })
      // El kid viaja en el encabezado: el verificador lo usa para elegir la clave pública.
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.kid, typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      // Corto a propósito: un JWT no se puede revocar antes de que venza.
      .setExpirationTime(this.config.tokenTtl)
      .sign(this.keys.privateKey);
  }

  /** Segundos de vida del token, para decírselo al cliente. */
  get ttlSeconds(): number {
    const match = /^(\d+)([smhd])$/.exec(this.config.tokenTtl);
    if (!match) return 0;
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
    return Number(match[1]) * unit;
  }
}
