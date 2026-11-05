const ExcelJS = require('exceljs');

const TEMPLATE_COLUMNS = [
  { header: 'Contractor Name', key: 'contractorName', width: 26 },
  { header: 'Worker Name', key: 'workerName', width: 22 },
  { header: 'Worker ID', key: 'workerId', width: 14 },
  { header: 'Category / Trade', key: 'category', width: 18 },
  { header: 'Site Location', key: 'siteLocation', width: 22 },
  { header: 'Month / Period', key: 'monthYear', width: 16 },
  { header: 'Present Days', key: 'presentDays', width: 14 },
  { header: 'OT Hours', key: 'overtimeHours', width: 12 },
  { header: 'Daily Rate (INR)', key: 'dailyRate', width: 16 },
  { header: 'Total Wages (INR)', key: 'wages', width: 18 },
  { header: 'Remarks', key: 'remarks', width: 20 },
];

function getSampleRows() {
  return [
    {
      contractorName: 'Apex Manpower Services',
      workerName: 'Ramesh Kumar',
      workerId: 'CW-1001',
      category: 'Electrician',
      siteLocation: 'Noida Plant Phase 2',
      monthYear: 'Nov 2026',
      presentDays: 26,
      overtimeHours: 8,
      dailyRate: 750,
      wages: 20250,
      remarks: 'Verified by Site In-charge',
    },
    {
      contractorName: 'Apex Manpower Services',
      workerName: 'Suresh Chauhan',
      workerId: 'CW-1002',
      category: 'Fitter',
      siteLocation: 'Noida Plant Phase 2',
      monthYear: 'Nov 2026',
      presentDays: 24,
      overtimeHours: 0,
      dailyRate: 700,
      wages: 16800,
      remarks: 'Full attendance',
    },
    {
      contractorName: 'Shree Ram Labour Co.',
      workerName: 'Mohd. Imran',
      workerId: 'SR-2041',
      category: 'Welder',
      siteLocation: 'Delhi Metro Station D-4',
      monthYear: 'Nov 2026',
      presentDays: 25,
      overtimeHours: 12,
      dailyRate: 800,
      wages: 21200,
      remarks: 'Night shift OT included',
    },
  ];
}

function applyHeaderStyling(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF3A230B' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5E2B3' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;
}

async function generateContractorTemplate(res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Valuecon Workforce HR';
  const sheet = workbook.addWorksheet('Contractor Attendance', { views: [{ showGridLines: true }] });
  sheet.columns = TEMPLATE_COLUMNS;
  applyHeaderStyling(sheet);

  getSampleRows().forEach((row) => {
    const r = sheet.addRow(row);
    r.alignment = { vertical: 'middle' };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Contractor_Attendance_Template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { generateContractorTemplate };
