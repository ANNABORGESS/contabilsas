import { FUSO_PADRAO, VIRADA_PADRAO, dataOperacional } from '@/domain/turno';

export const FUSO = process.env.BAR_FUSO || FUSO_PADRAO;
const v = Number(process.env.BAR_VIRADA_HORA);
export const VIRADA = Number.isInteger(v) && v >= 0 && v <= 12 ? v : VIRADA_PADRAO;

export const hoje = () => dataOperacional(new Date(), FUSO, VIRADA);
