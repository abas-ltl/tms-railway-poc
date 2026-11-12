import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';
import { SIGNING_KEYS, type SigningKeys } from './signing-keys.js';
import { TokensService } from './tokens.service.js';
import { UsersRepository } from './users.repository.js';

interface Credentials {
  email: string;
  password: string;
}

/** Validación mínima a mano. En un servicio real usaríamos ValidationPipe + class-validator. */
function parseCredentials(body: unknown): Credentials {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new BadRequestException('email inválido');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new BadRequestException('password debe tener al menos 8 caracteres');
  }
  return { email: email.trim().toLowerCase(), password };
}

/**
 * Rutas del servicio auth. Fíjate que aquí NO dicen "/auth/...":
 * el gateway recibe /auth/login y lo reenvía como /login.
 * auth no sabe ni le importa bajo qué prefijo público vive.
 */
@Controller()
export class AuthController {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokensService,
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
  ) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const { email, password } = parseCredentials(body);
    const user = await this.users.create(email, await hashPassword(password));
    if (!user) throw new ConflictException('Ese email ya está registrado');
    return { id: user.id, email: user.email };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown) {
    const { email, password } = parseCredentials(body);
    const user = await this.users.findByEmail(email);

    // Verificamos SIEMPRE, aunque el usuario no exista (contra un hash de relleno),
    // y respondemos el mismo error en ambos casos: no revelamos qué emails existen.
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Credenciales inválidas');

    return {
      accessToken: await this.tokens.issueAccessToken(user),
      tokenType: 'Bearer',
      expiresIn: this.tokens.ttlSeconds,
    };
  }

  /**
   * JWKS: la lista de claves PÚBLICAS. Gateway y orders la descargan para verificar firmas.
   * Es información pública por definición; aun así solo la exponemos en la red privada
   * porque nadie de fuera la necesita.
   */
  @Get('.well-known/jwks.json')
  jwks() {
    return { keys: [this.keys.publicJwk] };
  }
}
