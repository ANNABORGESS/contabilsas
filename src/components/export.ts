import { utils, writeFile } from 'xlsx'

export interface Sheet {
  name: string
  rows: Record<string, string | number>[]
}

/** Exporta uma ou mais planilhas para .xlsx. PDF é gerado pela impressão do navegador (CSS de impressão). */
export function exportExcel(fileName: string, sheets: Sheet[]) {
  const wb = utils.book_new()
  for (const s of sheets) {
    const ws = utils.json_to_sheet(s.rows.length ? s.rows : [{ Aviso: 'Sem dados no período' }])
    utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  }
  const safe = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_')
  writeFile(wb, `AKORA_${safe}.xlsx`)
}
