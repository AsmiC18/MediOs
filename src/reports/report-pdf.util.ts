import PDFDocument from 'pdfkit';

export type ReportPdfTable = {
  title: string;
  headers: string[];
  rows: string[][];
  footerRow?: string[];
};

export type ReportPdfInput = {
  title: string;
  from: string;
  to: string;
  branchId: string | null;
  generatedAt: string;
  tables: ReportPdfTable[];
  notes?: string[];
};

export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(input.title, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Period: ${input.from} — ${input.to}`);
    doc.text(`Branch scope: ${input.branchId ?? 'All authorized branches'}`);
    doc.text(`Generated: ${input.generatedAt}`);
    doc.moveDown();

    if (input.notes?.length) {
      for (const note of input.notes) {
        doc.fontSize(9).fillColor('#444444').text(note);
      }
      doc.fillColor('#000000');
      doc.moveDown();
    }

    for (const table of input.tables) {
      doc.fontSize(12).text(table.title);
      doc.moveDown(0.25);
      doc.fontSize(9);
      doc.text(table.headers.join(' | '));
      doc.moveDown(0.15);
      for (const row of table.rows) {
        doc.text(row.join(' | '));
      }
      if (table.footerRow) {
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').text(table.footerRow.join(' | '));
        doc.font('Helvetica');
      }
      doc.moveDown();
    }

    doc.end();
  });
}
