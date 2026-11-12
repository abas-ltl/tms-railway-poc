import { Controller, Get } from '@nestjs/common';

/**
 * Salud del gateway. A propósito NO comprueba auth ni orders: si orders se cae,
 * el gateway sigue sano (puede seguir sirviendo login, y responde 502 en /orders).
 * Si su healthcheck dependiera de orders, Railway reiniciaría el gateway por un fallo
 * que no es suyo, y se caería todo en cadena.
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'gateway' };
  }
}
