import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { TmsClaims } from '@tms/auth-jwt';
import { CurrentUser, JwtAuthGuard } from './jwt-auth.guard.js';
import { type NewOrder, OrdersRepository } from './orders.repository.js';

function parseNewOrder(body: unknown): NewOrder {
  const { origin, destination, weightKg } = (body ?? {}) as Record<string, unknown>;
  if (typeof origin !== 'string' || !origin.trim()) throw new BadRequestException('origin es obligatorio');
  if (typeof destination !== 'string' || !destination.trim()) {
    throw new BadRequestException('destination es obligatorio');
  }
  if (typeof weightKg !== 'number' || !(weightKg > 0)) {
    throw new BadRequestException('weightKg debe ser un número mayor que 0');
  }
  return { origin: origin.trim(), destination: destination.trim(), weightKg };
}

/**
 * A diferencia de auth, aquí el prefijo SÍ se conserva: el gateway reenvía /orders/... tal cual.
 * Es una decisión de la tabla de rutas del gateway, no de este servicio.
 *
 * @UseGuards a nivel de clase: TODAS las rutas de este controlador exigen JWT válido.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersRepository) {}

  @Get()
  list(@CurrentUser() user: TmsClaims) {
    return this.orders.listByOwner(user.sub);
  }

  @Post()
  create(@CurrentUser() user: TmsClaims, @Body() body: unknown) {
    return this.orders.create(user.sub, parseNewOrder(body));
  }

  @Get(':id')
  async findOne(@CurrentUser() user: TmsClaims, @Param('id', ParseUUIDPipe) id: string) {
    const order = await this.orders.findForOwner(id, user.sub);
    // 404 tanto si no existe como si es de otro usuario: no confirmamos que exista.
    if (!order) throw new NotFoundException('Orden no encontrada');
    return order;
  }
}
