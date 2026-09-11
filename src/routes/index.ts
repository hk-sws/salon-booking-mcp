import { Router } from 'express';
import readRoutes from './read.routes';
import availabilityRoutes from './availability.routes';
import bookingsRoutes from './bookings.routes';
import miscRoutes from './misc.routes';
import adminRoutes from './admin.routes';

const api = Router();

api.use(readRoutes);
api.use(availabilityRoutes);
api.use(bookingsRoutes);
api.use(miscRoutes);
api.use(adminRoutes);

export default api;
