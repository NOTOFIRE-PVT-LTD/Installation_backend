const ExcelJS = require('exceljs');
const ApiError = require('../utils/ApiError');

const DEFAULT_SPARES = [
  { clause: '4.15.2', nomenclature: 'CPU Card', modelNo: '', serialNo: '0968', hologram: 'SAHP058006', qty: '01 Nos', qtyValue: 1, unit: 'Nos' },
  { clause: '4.15.2', nomenclature: 'Power Supply', modelNo: '', serialNo: '1228', hologram: 'SAHP058007', qty: '01 Nos', qtyValue: 1, unit: 'Nos' },
  { clause: '4.15.1', nomenclature: 'Loop Card', modelNo: '', serialNo: '1021', hologram: 'SAHP058008', qty: '01 Nos', qtyValue: 1, unit: 'Nos' },
  { clause: '4.15.1', nomenclature: 'Multisensor Detector', modelNo: '', serialNo: '83425 & 83426', hologram: 'SAHP058009 & SAHP058010', qty: '02 Nos', qtyValue: 2, unit: 'Nos' },
  { clause: '4.15.1', nomenclature: 'Manual Call Point with Isolator', modelNo: '', serialNo: '10181', hologram: 'SAHP058011', qty: '01 Nos', qtyValue: 1, unit: 'Nos' },
  { clause: '4.15.1', nomenclature: 'Isolator (for Spare MCP)', modelNo: '', serialNo: '15935', hologram: 'SAHP058012', qty: '01 Nos', qtyValue: 1, unit: 'Nos' },
  { clause: '4.15.1', nomenclature: 'Audio Visual Alarm', modelNo: '', serialNo: '8209', hologram: 'SAHP058013', qty: '01 Nos', qtyValue: 1, unit: 'Nos' },
];

const INTERNAL_TESTS = [
  { sNo: '1', name: 'Visual Inspection ( Clause 7.4.1.1 & 9.2 )', specified: '', observed: '', result: '', isHeader: true },
  { sNo: 'i', name: 'Visual Inspection ( Clause 7.4.1.1 & 9.2 )', specified: 'Specified Value', observed: 'Found Satisfactory', result: 'OK' },
  { sNo: '2', name: 'Performance Test ( Clause 7.4.1.2 & 9.3):', specified: '', observed: '', result: '', isHeader: true },
  { sNo: 'i', name: 'LHS Heat/Fire & Interface Test ( Clause 9.3 )', specified: 'LHS shall detect the fire condition at 70 °C ± 8.3 °C', observed: 'LHS is detecting the fire condition at 70 °C ± 8.3 °C', result: 'OK' },
  { sNo: 'ii', name: 'Change of stages & Sensitivity Test of ASD ( Clause 9.3 )', specified: 'Stages of alarm should change. & Sensitive should be for Alert and alarm condition.', observed: 'Stages of alarm is change. & Sensitive for Alert and alarm condition.', result: 'OK' },
  { sNo: 'iii', name: 'Transport time Test of ASD ( Clause 9.3 )', specified: '≤ 60 Sec', observed: '≤ 60 Sec', result: 'OK' },
  { sNo: 'iv', name: 'Insulation Resistance Test in MΩ ( Clause 9.3 )', specified: '≥10MΩ', observed: '> 100 MΩ', result: 'OK' },
  { sNo: 'v', name: 'Power Supply Test ( Clause 4.9.8 )', specified: '195.5 - 253 V AC', observed: 'Found Satisfactory', result: 'OK' },
  { sNo: 'vi', name: 'In-Built Charging Facility Test ( Clause 4.9.8 )', specified: 'Panel should have in built charging facility', observed: 'In built charging facility is available', result: 'OK' },
  { sNo: 'vii', name: 'Battery Backup Test ( Clause 4.9.8 )', specified: '>24 Hours', observed: '> 24 Hours', result: 'OK' },
  { sNo: 'viii', name: 'Minimum Cut off Voltage Test ( Clause 9.3 )', specified: 'Specified by OEM', observed: '106.2 - 111.9VAC', result: 'OK' },
  { sNo: 'ix', name: 'Changeover Time Test ( Clause 9.3 )', specified: '< 10second', observed: '< 10 Sec.', result: 'OK' },
  { sNo: 'x', name: 'Response Time Test ( Clause 9.3 )', specified: '≤ 10second', observed: '≤ 10second', result: 'OK' },
  { sNo: 'xi', name: 'Primary Source Test ( Clause 9.3 )', specified: 'Primary source should be functional', observed: 'Primary source is functional', result: 'OK' },
  { sNo: 'xii', name: 'Manual Call Point Test ( Clause 9.3 )', specified: 'MCP should work normally and should be activated on pressing.', observed: 'MCP is work normally and activated on pressing.', result: 'OK' },
  { sNo: 'xiii', name: 'Audio Visual Alarm Test for ASD ( Clause 9.3 )', specified: 'on receiving signal an audio visual indication in control panel shall be activated.', observed: 'on receiving signal an audio visual indication in control panel is activated.', result: 'OK' },
  { sNo: 'xiv', name: 'Sound Level Test of Audio Visual Alarm (Sounder Strobe) ( Clause 9.3 )', specified: 'Sound level should be 90dB', observed: 'Sound level is 90dB', result: 'OK' },
  { sNo: 'xv', name: 'Re-Settability Test ( Clause 9.3 )', specified: 'Device shall be of resettable type.', observed: 'Device is of resettable type', result: 'OK' },
  { sNo: 'xvi', name: 'Addressability Test ( Clause 9.3 )', specified: 'All the detectors shall be addressable.', observed: 'All the detectors are addressable.', result: 'OK' },
  { sNo: 'xvii', name: 'Cross Zoning Test ( Clause 9.3 )', specified: 'Multi sensors should work in cross zoning.', observed: 'Multi sensors is work in cross zoning.', result: 'OK' },
  { sNo: 'xviii', name: 'Clash Test ( Clause 9.3 )', specified: 'When more than one set of cross zoned detectors are initated sequentially, the alarm generated initially shall not be interupted significantly or stopped.', observed: 'When more than one set of cross zoned detectors are initated sequentially, the alarm generated initially is not be interupted significantly or stopped.', result: 'OK' },
  { sNo: '3', name: 'Reverse Polarity Test ( Clause 7.4.1.3 & 9.4 )', specified: '', observed: '', result: '', isHeader: true },
  { sNo: 'i', name: 'Reverse Polarity Test ( Clause 9.4 )', specified: '', observed: 'Complied', result: 'OK' },
];

const WARRANTY_TEXT = `The Contractor also guarantees that the said goods would continue to conform to the description and quality as aforesaid, for a period of 24 months after their supply and this warranty shall survive notwithstanding the fact that the goods may have been inspected, accepted and payment therefore made by the Purchaser. If a longer/shorter period of warranty/guarantee is specified in the 'Particulars' mentioned as per RDSO/SPN/217/2025 ver 3.1 or latest under clause 12.1 or any other contract documents, same shall be applicable instead of period specified in this clause.
Note:-
1. The guarantee covers defects arising solely due to manufacturing faults under normal and proper usage of the product.
2. This guarantee does not cover breakage, cracks, physical damage, or damage caused due to mishandling, misuse, negligence, improper installation, voltage fluctuations, fire, water ingress, accidents, or any damage caused by any person.
3. Any damage to the panel, display, casing, PCB, connectors, wiring, or accessories due to external force or unauthorized handling will void the guarantee.
4. Repairs, modifications, or alterations carried out by any unauthorized person or service center will render this guarantee null and void.
5. Customers are advised to inspect the product immediately upon delivery. Any visible damage, missing items, or discrepancies must be reported at the time of delivery or within the specified complaint period of 7 Days.
6. In case of receiving a damaged or missing item, customers must provide a clear and continuous unboxing video showing the package seal, product, and issue, as required by our terms and conditions.
7. For any technical support or assistance from our side, a complete and clear video of the issue must be shared for verification and resolution through email only.
8. Replacement, if applicable, will be accepted and processed within 7–10 working days from the date of receiving Period.
9. The company reserves the right to inspect, verify, and decide on the acceptance or rejection of any claim based on the evidence provided.
10. The guarantee is non-transferable and is applicable only to the original purchaser.
11. All complaints will be accepted only with valid proof and appropriate supporting documents, submitted via email to care@no2fire.com and business@no2fire.com.`;

function padQty(num, unit) {
  const n = Number(num) || 0;
  const formatted = n < 10 && Number.isInteger(n) ? `0${n}` : String(n);
  return unit ? `${formatted} ${unit}` : formatted;
}

function normalizeUnit(u = '') {
  const lower = String(u || '').toLowerCase().trim();
  if (lower.startsWith('mtr') || lower.startsWith('met')) return 'Mtr';
  if (lower.startsWith('set')) return 'Set';
  if (lower.startsWith('no')) return 'Nos';
  return u || 'Nos';
}

/**
 * Cleans a raw description into a concise equipment name if it doesn't match a known preset,
 * stripping "Supply, Installation, Testing & Commissioning of..." and trailing "complying to RDSO..." boilerplate.
 */
function cleanNomenclatureFallback(rawText = '') {
  let text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'AFDAS Item';

  text = text
    .replace(
      /^(?:supply|providing|installation|testing|commissioning|erection|fixing|laying|wiring|and|&|,|\s)+of\s+/i,
      ''
    )
    .replace(/^(?:resettable|analogue\s+type|analogue\s+addressable|loop\s+powered|addressable\s+and\s+resettable|addressable|networkable)\s*,?\s*/i, '')
    .replace(/^(?:resettable|analogue\s+type|analogue\s+addressable|loop\s+powered)\s*,?\s*/i, '');

  text = text
    .split(/\s*(?:,?\s*complying\s+to\b|,?\s*conforming\s+to\b|,?\s*confirming\s+to\b|,?\s*as\s+per\s+RDSO\b|,?\s*as\s+per\s+specification\b|,?\s*as\s+per\s+latest\b|\s+with\s+all\s+accessories\b|\.\s*As\s+per\b|\.\s*Note\b)/i)[0]
    .replace(/[.;,:]+$/g, '')
    .trim();

  return text.slice(0, 60).trim() || 'AFDAS Item';
}

/**
 * Infers Notofire nomenclature, modelNo, and subRows from an item name or full RDSO description.
 */
function inferNotofireProductMeta(nameOrDesc = '', qtyValue = 1, unit = 'Nos') {
  const d = String(nameOrDesc || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. CPVC Pipe / Sampling Pipe (check before Aspiration so "CPVC pipe for Aspiration Detection system" matches CPVC Pipe!)
  if (d.includes('cpvc') || d.includes('upvc') || (d.includes('pipe') && (d.includes('aspiration') || d.includes('sampling')))) {
    return {
      nomenclature: 'CPVC Pipe',
      modelNo: 'Ashirvad',
      unit: 'Mtr',
      subRows: [],
    };
  }

  // 2. LHS Interface Module / LHS Module (check before LHS Cable!)
  if (
    (d.includes('lhs') || d.includes('lhd') || d.includes('linear heat') || d.includes('liner heat')) &&
    (d.includes('interface') || d.includes('module')) &&
    !d.includes('hollow metallic') &&
    !d.includes('sensing cable') &&
    !d.includes('(lhs) cable')
  ) {
    return {
      nomenclature: 'LHS Module with Input Module',
      modelNo: 'F3050',
      subRows: [],
    };
  }

  // 3. LHS Cable / Linear (or "Liner") Heat Sensing Cable
  if (
    d.includes('lhs cable') ||
    d.includes('lhd cable') ||
    d.includes('linear heat') ||
    d.includes('liner heat') ||
    (d.includes('lhs') && d.includes('cable'))
  ) {
    return {
      nomenclature: 'LHS Cable',
      modelNo: 'F3050',
      unit: 'Mtr',
      subRows: [],
    };
  }

  // 4. Monitor Module (with inbuilt isolator)
  if (d.includes('monitor module')) {
    return {
      nomenclature: 'Monitor Module with Isolator',
      modelNo: 'NF5211',
      subRows: [],
    };
  }

  // 5. Control Module
  if (d.includes('control module') || d.includes('relay module')) {
    return {
      nomenclature: 'Control Module',
      modelNo: 'NF5212',
      subRows: [],
    };
  }

  // 6. Manual Call Point (in RDSO AFDAS always Manual Call Point with Isolator)
  if (d.includes('manual call point') || /\bmcp\b/.test(d)) {
    return {
      nomenclature: 'Manual Call Point with Isolator',
      modelNo: 'NF5264',
      subRows: d.includes('nf5260')
        ? [
          {
            nomenclature: 'Isolator',
            modelNo: 'NF5260',
            serialNo: '',
            hologram: '',
            qtyValue,
            unit: 'Nos',
            qtyOnOrder: padQty(qtyValue, 'Nos'),
            qtyOffered: padQty(qtyValue, 'Nos'),
            qtyAccepted: padQty(qtyValue, 'Nos'),
          },
        ]
        : [],
    };
  }

  // 7. Aspiration (Air Sampling Type) Smoke Detection Unit
  if (
    d.includes('aspiration') ||
    d.includes('air sampling') ||
    /\basd\b/.test(d)
  ) {
    const hasPowerSupply = d.includes('power supply') || d.includes('battery backup');
    const inputModuleQty = qtyValue * 4;
    return {
      nomenclature: hasPowerSupply
        ? 'Aspiration Smoke Detector with Input Module & Power Supply'
        : 'Aspiration Smoke Detector with Input Module',
      modelNo: 'ASD532',
      subRows: hasPowerSupply
        ? [
          {
            nomenclature: 'Input Module',
            modelNo: 'NF5211',
            serialNo: '',
            hologram: '',
            qtyValue: inputModuleQty,
            unit: 'Nos',
            qtyOnOrder: padQty(inputModuleQty, 'Nos'),
            qtyOffered: padQty(inputModuleQty, 'Nos'),
            qtyAccepted: padQty(inputModuleQty, 'Nos'),
          },
          {
            nomenclature: 'Power Supply',
            modelNo: 'NF5109',
            serialNo: '',
            hologram: '',
            qtyValue,
            unit: 'Nos',
            qtyOnOrder: padQty(qtyValue, 'Nos'),
            qtyOffered: padQty(qtyValue, 'Nos'),
            qtyAccepted: padQty(qtyValue, 'Nos'),
          },
        ]
        : [],
    };
  }

  // 8. Hooter Cum Strobe / Audio Visual Alarm / Flasher / Hooter
  if (d.includes('hooter cum strobe') || d.includes('hooter-cum-strobe') || d.includes('sounder cum strobe') || d.includes('hooter with strobe')) {
    return {
      nomenclature: 'Hooter Cum Strobe',
      modelNo: 'NF5266',
      subRows: [],
    };
  }
  if (d.includes('audio visual alarm') || d.includes('hooter and strobe') || d.includes('hooter & strobe')) {
    return {
      nomenclature: d.includes('audio visual') ? 'Audio Visual Alarm' : 'Hooter Cum Strobe',
      modelNo: 'NF5266',
      subRows: [],
    };
  }
  if (d.includes('flasher') && !d.includes('hooter')) {
    return {
      nomenclature: 'Flasher',
      modelNo: 'NF5266',
      subRows: [],
    };
  }
  if (d.includes('hooter') && !d.includes('strobe') && !d.includes('audio visual')) {
    return {
      nomenclature: 'Hooter',
      modelNo: 'NF5266',
      subRows: [],
    };
  }

  // 9. Cables (Armoured vs Unarmoured / FRLS / Fire Survival / 2C 1.5 sq mm / copper cable)
  const isArmouredCable =
    (d.includes('armoured') && !d.includes('unarmoured') && !d.includes('un-armoured')) &&
    (d.includes('cable') || d.includes('sq mm') || d.includes('sq.mm') || d.includes('2c'));
  if (isArmouredCable) {
    return {
      nomenclature: 'Armoured Cable',
      modelNo: 'ATC-AFSC',
      unit: 'Mtr',
      subRows: [],
    };
  }
  if (
    d.includes('unarmoured') ||
    d.includes('un-armoured') ||
    d.includes('frls') ||
    d.includes('fire survival') ||
    d.includes('circuit integrity') ||
    d.includes('2c x 1.5') ||
    d.includes('2c 1.5') ||
    d.includes('2 core x 1.5') ||
    (d.includes('copper cable') && !d.includes('armoured'))
  ) {
    return {
      nomenclature: 'Unarmoured Cable',
      modelNo: 'ATC-UFSC',
      unit: 'Mtr',
      subRows: [],
    };
  }

  // 10. Detectors (Multi Sensor / Smoke / Heat)
  if (
    d.includes('heat and smoke') ||
    d.includes('heat & smoke') ||
    d.includes('smoke and heat') ||
    d.includes('multi sensor') ||
    d.includes('multisensor') ||
    d.includes('multi-sensor')
  ) {
    return {
      nomenclature: 'Heat and Smoke (Multi Sensor) Detector',
      modelNo: 'NF5163',
      subRows: [],
    };
  }
  if (d.includes('smoke detector') || d.includes('smoke detectors')) {
    return {
      nomenclature: 'Smoke Detector',
      modelNo: 'NF5163',
      subRows: [],
    };
  }
  if (d.includes('heat detector') || d.includes('heat detectors') || d.includes('thermal detector')) {
    return {
      nomenclature: 'Heat Detector',
      modelNo: 'NF5163',
      subRows: [],
    };
  }

  // 11. Fire Alarm Control Panel
  if (d.includes('control panel') || d.includes('single loop') || d.includes('2 loop') || d.includes('4 loop') || d.includes('networkable')) {
    const hasTcpIp = d.includes('tcp/ip') || d.includes('tcp ip') || d.includes('networking card') || d.includes('media converter');
    return {
      nomenclature: hasTcpIp ? 'Fire Alarm Control Panel(1 Loop) with TCP/IP' : 'Control Panel',
      modelNo: 'NF5109',
      subRows: hasTcpIp
        ? [
          {
            nomenclature: 'TCP/IP',
            modelNo: 'CFMS-TCZ15',
            serialNo: '',
            hologram: '',
            qtyValue,
            unit: 'Nos',
            qtyOnOrder: padQty(qtyValue, 'Nos'),
            qtyOffered: padQty(qtyValue, 'Nos'),
            qtyAccepted: padQty(qtyValue, 'Nos'),
          },
        ]
        : [],
    };
  }

  // 12. Standalone Isolator Device / Isolator Module (checked after MCP, Monitor Module, Detectors)
  if (
    d.includes('isolator device') ||
    d.includes('isolator module') ||
    d.includes('fault isolator') ||
    d.includes('short circuit isolator') ||
    d.includes('loop isolator') ||
    d.includes('isolate the circuit') ||
    d.includes('isolator')
  ) {
    return {
      nomenclature: 'Isolator Module',
      modelNo: 'NF5260',
      unit: 'Nos',
      subRows: [],
    };
  }

  return {
    nomenclature: cleanNomenclatureFallback(nameOrDesc),
    modelNo: '',
    subRows: [],
  };
}

/**
 * Parses constituent items from a composite description such as:
 * "...consisting of 01no. Control panel, 01 Flasher, 1no. hooter, 6 nos. smoke detectors, 06 nos heat detector and 01no. Manual call point. Inspection RDSO"
 * Returns an array of constituent items if 2+ items are found; otherwise returns null.
 */
function extractConstituentItemsFromDescription(description = '') {
  const raw = String(description || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const match = raw.match(/\b(?:consisting\s+of|comprising\s+of|comprising|consists\s+of|including)\s*[:\-]?\s*([\s\S]+)/i);
  if (!match) return null;

  // Stop at sentence boundary like ". Inspection", ". Note:", "as per" if after the list
  let listText = match[1]
    .split(/\.\s*(?:Inspection|Note|Material|The\s+location|It\s+shall)/i)[0]
    .replace(/\.\s*$/, '')
    .trim();

  // Split by comma or " and " / " & "
  const segments = listText
    .split(/\s*,\s*|\s+\band\b\s+|\s*&\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length < 2) return null;

  const parsedItems = [];
  for (const seg of segments) {
    // Pattern A: leading quantity like "01no. Control panel", "01 Flasher", "6 nos. smoke detectors", "06 nos heat detector"
    const leadMatch = seg.match(/^(\d+(?:\.\d+)?)\s*(?:nos?\.?|sets?\.?|mtrs?\.?|metres?\.?|pcs?\.?)?\s+(.+)$/i);
    // Pattern B: trailing quantity like "Control panel - 01 no."
    const trailMatch = !leadMatch && seg.match(/^(.+?)\s*[-–:]\s*(\d+(?:\.\d+)?)\s*(nos?\.?|sets?\.?|mtrs?\.?|metres?\.?)?$/i);

    if (leadMatch) {
      const qtyNum = Number(leadMatch[1]) || 1;
      const unitMatch = seg.match(/^\d+(?:\.\d+)?\s*(nos?\.?|sets?\.?|mtrs?\.?|metres?\.?)\b/i);
      const unit = normalizeUnit(unitMatch ? unitMatch[1] : 'Nos');
      const rawName = leadMatch[2].replace(/[.;,]+$/, '').trim();
      const meta = inferNotofireProductMeta(rawName, qtyNum, unit);
      parsedItems.push({
        rawName,
        nomenclature: meta.nomenclature,
        modelNo: meta.modelNo,
        qtyPerSet: qtyNum,
        unit,
        subRows: meta.subRows,
      });
    } else if (trailMatch) {
      const rawName = trailMatch[1].replace(/[.;,]+$/, '').trim();
      const qtyNum = Number(trailMatch[2]) || 1;
      const unit = normalizeUnit(trailMatch[3] || 'Nos');
      const meta = inferNotofireProductMeta(rawName, qtyNum, unit);
      parsedItems.push({
        rawName,
        nomenclature: meta.nomenclature,
        modelNo: meta.modelNo,
        qtyPerSet: qtyNum,
        unit,
        subRows: meta.subRows,
      });
    }
  }

  return parsedItems.length >= 2 ? parsedItems : null;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new ApiError(502, 'Gemini returned an empty response');

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new ApiError(502, 'Gemini response was not valid JSON');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ApiError(502, 'Gemini response was not valid JSON');
  }
}

const CALL_LETTER_EXTRACTION_PROMPT = `You are an expert document extraction AI for Indian Railway RDSO Call Letters / Inspection Proformas ("PROFORMA FOR FURNISHING PARTICULARS FOR RDSO MATERIALS TO BE SUPPLIED BY THE CONTRACTORS").
Read every page of the attached PDF / image carefully and extract ALL header fields, ALL schedule rows of the "MATERIALS TO BE INSPECTED" table ("proformaRows"), and ALL individual equipment/material items for the Offer/Packing List ("packingItems").

Return ONLY valid JSON with this exact shape:
{
  "nameOfWork": string,
  "loaNoAndDate": string,
  "orderingAuthority": string,
  "contractorName": string,
  "contractorShortName": string,
  "consignee": string,
  "inspectionChargesBy": string,
  "inspectionAuthority": string,
  "contractValidity": string,
  "forwardedLetterNo": string,
  "letterDate": string,
  "firmNameAndPlace": string,
  "specificationNo": string,
  "zone": string,
  "proformaRows": [
    {
      "itemNoOfSchB": string,
      "description": string,
      "qty": string,
      "qtyValue": number,
      "unit": "Mtr" | "Set" | "Nos",
      "depttSchRate": number,
      "depttSchRateRaw": string,
      "acceptedRate": string,
      "firmName": string
    }
  ],
  "packingItems": [
    {
      "itemNoOfSchB": string,
      "nomenclature": string,
      "description": string,
      "qtyPerSet": number,
      "scheduleMultiplier": number,
      "qtyValue": number,
      "unit": "Mtr" | "Set" | "Nos",
      "depttSchRate": number,
      "acceptedRate": string,
      "firmName": string
    }
  ]
}

Extraction Rules:
1. "proformaRows": Extract every row of the PDF table exactly as printed ("Item No of Sch. 'B'", full "Description of material with Specn.", "Qty", "Deptt. Sch. Rate", "Accepted Rate", "Name of the firm on which order is placed").
2. CRITICAL RULE FOR "packingItems" (OFFER / PACKING LIST NOMENCLATURE):
   - Look inside the "Description of material with Specn." of each row in the PDF table.
   - If a row's description lists multiple constituent items (e.g. "consisting of 01no. Control panel, 01 Flasher, 1no. hooter, 6 nos. smoke detectors, 06 nos heat detector and 01no. Manual call point"), you MUST split them into SEPARATE objects in "packingItems" — one for each item present in the description — and MULTIPLY each item's quantity in the description (qtyPerSet) by the row's overall Qty (scheduleMultiplier) to compute the final qtyValue (qtyValue = qtyPerSet * scheduleMultiplier)!
     For example, if the row has Qty = "3 Nos." and description "consisting of 01no. Control panel, 01 Flasher, 1no. hooter, 6 nos. smoke detectors, 06 nos heat detector and 01no. Manual call point", output 6 separate objects in "packingItems" with final multiplied quantities (1*3=3, 6*3=18):
     - { "nomenclature": "Control Panel", "qtyPerSet": 1, "scheduleMultiplier": 3, "qtyValue": 3, "unit": "Nos" }
     - { "nomenclature": "Flasher", "qtyPerSet": 1, "scheduleMultiplier": 3, "qtyValue": 3, "unit": "Nos" }
     - { "nomenclature": "Hooter", "qtyPerSet": 1, "scheduleMultiplier": 3, "qtyValue": 3, "unit": "Nos" }
     - { "nomenclature": "Smoke Detector", "qtyPerSet": 6, "scheduleMultiplier": 3, "qtyValue": 18, "unit": "Nos" }
     - { "nomenclature": "Heat Detector", "qtyPerSet": 6, "scheduleMultiplier": 3, "qtyValue": 18, "unit": "Nos" }
     - { "nomenclature": "Manual Call Point with Isolator", "qtyPerSet": 1, "scheduleMultiplier": 3, "qtyValue": 3, "unit": "Nos" }
   - If a row's description describes a single item, derive the exact standard RDSO AFDAS Nomenclature using these mandatory mappings:
     * Manual call point / Manual call points -> "Manual Call Point with Isolator"
     * Resettable, Analogue Type Linear/Liner Heat Sensing (LHS) Cable / LHS Cable -> "LHS Cable"
     * LHS Interface Module / LHD Interface Module / LHS Module -> "LHS Module with Input Module"
     * Aspiration (Air Sampling Type) Detection unit / Aspiration smoke detector -> "Aspiration Smoke Detector with Input Module" (or "Aspiration Smoke Detector with Input Module & Power Supply" if power supply is explicitly mentioned)
     * CPVC pipe for Aspiration Detection system / CPVC pipe -> "CPVC Pipe"
     * Analogue Addressable loop powered Monitor Module with inbuilt isolator / Monitor Module -> "Monitor Module with Isolator"
     * Analogue Addressable loop powered Control Module / Control Module -> "Control Module"
     * Hooter cum strobe / Hooter-cum-strobe -> "Hooter Cum Strobe"
     * Audio Visual alarm (Hooter and strobe) -> "Audio Visual Alarm"
     * Unarmoured cable / FRLS / Fire Survival Circuit Integrity Cable 2C x 1.5 sq.mm -> "Unarmoured Cable" (Model: "ATC-UFSC", Unit: "Mtr")
     * 2C 1.5 sq mm twisted shielded armoured copper cable / Armoured cable -> "Armoured Cable" (Model: "ATC-AFSC", Unit: "Mtr")
     * Isolator Device to isolate the circuit in case of short circuit / Isolator Module / Fault Isolator -> "Isolator Module" (Model: "NF5260", Unit: "Nos")
     * Heat and smoke multi sensor detector -> "Heat and Smoke (Multi Sensor) Detector"
     * Fire alarm control panel (with TCP/IP) -> "Fire Alarm Control Panel(1 Loop) with TCP/IP" (or "Control Panel" if without TCP/IP)
     * NEVER output "Supply, Installation, Testing & Commissioning of..." as a nomenclature! Always extract the clean equipment name.
3. "depttSchRate": numeric rate from "Deptt. Sch. Rate" column. Strip "Rs." and commas.
4. "acceptedRate": exact text from "Accepted Rate" column (e.g. "At Par" or "233123.02 (Escalation @15% below)").
5. "contractorShortName": short 1-word identifier of the contractor (e.g. "QSHE").`;

async function callGeminiWithPdf(fileBuffer, mimeType, apiKey) {
  const configuredModel = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim().replace(/^models\//, '');
  const modelsToTry = [
    ...new Set([
      configuredModel,
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
    ]),
  ].filter((m) => m && !m.startsWith('gemini-2.5'));
  const base64Data = fileBuffer.toString('base64');

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: CALL_LETTER_EXTRACTION_PROMPT },
                {
                  inlineData: {
                    mimeType: mimeType || 'application/pdf',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new ApiError(502, payload?.error?.message || `Gemini request failed (${response.status})`);
        continue;
      }

      const parts = payload?.candidates?.[0]?.content?.parts || [];
      const content = parts
        .filter((p) => p && typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (!content) {
        const reason = payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || 'empty';
        lastError = new ApiError(502, `Gemini returned an empty response (${model}: ${reason})`);
        continue;
      }
      return extractJsonObject(content);
    } catch (err) {
      lastError = err instanceof ApiError ? err : new ApiError(502, err?.message || `Gemini request failed (${model})`);
      continue;
    }
  }

  throw lastError || new ApiError(502, 'Gemini extraction failed');
}

/**
 * Expands proforma schedule rows into Offer / Packing List items,
 * automatically splitting composite "consisting of ..." descriptions into individual items.
 */
function buildPackingItemsFromRows(proformaRows = [], geminiPackingItems = [], defaultFirm = '') {
  // First check if any proformaRow has a composite "consisting of ..." description
  const expandedFromDescriptions = [];
  let hasCompositeSplit = false;

  proformaRows.forEach((row, idx) => {
    const rowQty = Number(row.qtyValue) || Number(String(row.qty || '').replace(/[^0-9.]/g, '')) || 1;
    const rowUnit = normalizeUnit(row.unit || String(row.qty || '').replace(/[0-9.\s]/g, ''));
    const depttSchRate = Number(String(row.depttSchRate ?? row.depttSchRateRaw ?? 0).replace(/[^0-9.]/g, '')) || 0;
    const constituents = extractConstituentItemsFromDescription(row.description);

    if (constituents && constituents.length >= 2) {
      hasCompositeSplit = true;
      constituents.forEach((c, cIdx) => {
        const qtyPerSet = Number(c.qtyPerSet) || 1;
        const finalQty = qtyPerSet * rowQty;
        const unit = normalizeUnit(c.unit || 'Nos');
        const formattedQty = padQty(finalQty, unit);
        expandedFromDescriptions.push({
          itemNoOfSchB: `${row.itemNoOfSchB || `Item ${idx + 1}`} (${cIdx + 1})`,
          description: `${c.nomenclature} — as per ${row.itemNoOfSchB || 'Schedule'}: ${row.description}`,
          nomenclature: c.nomenclature,
          modelNo: c.modelNo || '',
          serialNo: '',
          hologram: '',
          qty: formattedQty,
          qtyValue: finalQty,
          qtyPerSet,
          scheduleMultiplier: rowQty,
          unit,
          qtyOnOrder: formattedQty,
          qtyOffered: formattedQty,
          qtyAccepted: formattedQty,
          depttSchRate: cIdx === 0 ? depttSchRate : 0,
          depttSchRateRaw: cIdx === 0 && depttSchRate ? `Rs. ${depttSchRate.toFixed(2)}` : '',
          acceptedRate: String(row.acceptedRate || 'At Par').trim(),
          firmName: String(row.firmName || defaultFirm).trim(),
          subRows: (c.subRows || []).map((sr) => {
            const srQty = (Number(sr.qtyValue) || qtyPerSet) * rowQty;
            const srFmt = padQty(srQty, sr.unit || 'Nos');
            return { ...sr, qtyValue: srQty, qtyOnOrder: srFmt, qtyOffered: srFmt, qtyAccepted: srFmt };
          }),
        });
      });
    } else {
      const meta = inferNotofireProductMeta(row.description || row.nomenclature, rowQty, rowUnit);
      const effectiveUnit = meta.unit || rowUnit;
      const formattedQty = padQty(rowQty, effectiveUnit);
      expandedFromDescriptions.push({
        itemNoOfSchB: String(row.itemNoOfSchB || `Item ${idx + 1}`).trim(),
        description: String(row.description || '').trim(),
        nomenclature: meta.nomenclature || String(row.nomenclature || '').trim(),
        modelNo: meta.modelNo,
        serialNo: '',
        hologram: '',
        qty: String(row.qty || formattedQty).trim(),
        qtyValue: rowQty,
        qtyPerSet: rowQty,
        scheduleMultiplier: 1,
        unit: effectiveUnit,
        qtyOnOrder: formattedQty,
        qtyOffered: formattedQty,
        qtyAccepted: formattedQty,
        depttSchRate,
        depttSchRateRaw: String(row.depttSchRateRaw || (depttSchRate ? `Rs. ${depttSchRate.toFixed(2)}` : '')).trim(),
        acceptedRate: String(row.acceptedRate || 'At Par').trim(),
        firmName: String(row.firmName || defaultFirm).trim(),
        subRows: meta.subRows,
      });
    }
  });

  if (hasCompositeSplit) {
    return expandedFromDescriptions;
  }

  // If Gemini returned more packingItems than proformaRows (meaning Gemini split a composite row), use Gemini's packingItems
  if (Array.isArray(geminiPackingItems) && geminiPackingItems.length > proformaRows.length) {
    return geminiPackingItems.map((row, idx) => {
      const qtyPerSet = Number(row.qtyPerSet) || Number(row.qtyValue) || 1;
      const mult = Number(row.scheduleMultiplier) || 1;
      const finalQty = Number(row.qtyValue) === qtyPerSet * mult ? Number(row.qtyValue) : qtyPerSet * mult;
      const unit = normalizeUnit(row.unit || 'Nos');
      const formattedQty = padQty(finalQty, unit);
      const meta = inferNotofireProductMeta(row.nomenclature || row.description, finalQty, unit);
      const depttSchRate = Number(String(row.depttSchRate ?? 0).replace(/[^0-9.]/g, '')) || 0;

      return {
        itemNoOfSchB: String(row.itemNoOfSchB || `Item ${idx + 1}`).trim(),
        description: String(row.description || row.nomenclature || '').trim(),
        nomenclature: String(row.nomenclature || meta.nomenclature || '').trim(),
        modelNo: meta.modelNo,
        serialNo: '',
        hologram: '',
        qty: formattedQty,
        qtyValue: finalQty,
        qtyPerSet,
        scheduleMultiplier: mult,
        unit,
        qtyOnOrder: formattedQty,
        qtyOffered: formattedQty,
        qtyAccepted: formattedQty,
        depttSchRate,
        depttSchRateRaw: depttSchRate ? `Rs. ${depttSchRate.toFixed(2)}` : '',
        acceptedRate: String(row.acceptedRate || 'At Par').trim(),
        firmName: String(row.firmName || defaultFirm).trim(),
        subRows: meta.subRows,
      };
    });
  }

  return expandedFromDescriptions;
}

async function parseCallLetterPdfWithGemini(fileBuffer, mimeType = 'application/pdf') {
  if (!fileBuffer || !fileBuffer.length) {
    throw new ApiError(400, 'Please upload a valid PDF or image file');
  }
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) {
    throw new ApiError(503, 'GEMINI_API_KEY is not configured in Backend .env');
  }

  const parsed = await callGeminiWithPdf(fileBuffer, mimeType, geminiKey);
  const rawProformaRows = Array.isArray(parsed.proformaRows) && parsed.proformaRows.length
    ? parsed.proformaRows
    : Array.isArray(parsed.items)
      ? parsed.items
      : [];

  const defaultFirm = String(
    parsed.firmNameAndPlace ||
    'OEM/Supplier: M/s Notifire Private Limited. Place of Inspection: Notifire Pvt. Ltd., C-146 Ground Floor, Sector 63, Noida-201301(U.P) INDIA'
  ).trim();

  const proformaRows = rawProformaRows.map((row, idx) => {
    const qtyValue = Number(row.qtyValue) || Number(String(row.qty || '').replace(/[^0-9.]/g, '')) || 0;
    const unit = normalizeUnit(row.unit || String(row.qty || '').replace(/[0-9.\s]/g, ''));
    const depttSchRate = Number(String(row.depttSchRate ?? row.depttSchRateRaw ?? 0).replace(/[^0-9.]/g, '')) || 0;
    return {
      itemNoOfSchB: String(row.itemNoOfSchB || `Item ${idx + 1}`).trim(),
      description: String(row.description || '').trim(),
      qty: String(row.qty || padQty(qtyValue, unit)).trim(),
      qtyValue,
      unit,
      depttSchRate,
      depttSchRateRaw: String(row.depttSchRateRaw || (depttSchRate ? `Rs. ${depttSchRate.toFixed(2)}` : '')).trim(),
      acceptedRate: String(row.acceptedRate || 'At Par').trim(),
      firmName: String(row.firmName || defaultFirm).trim(),
    };
  });

  const items = buildPackingItemsFromRows(proformaRows, parsed.packingItems, defaultFirm);

  const totalMaterialCost = proformaRows.reduce(
    (sum, r) => sum + (Number(r.qtyValue) || 0) * (Number(r.depttSchRate) || 0),
    0
  );

  return {
    nameOfWork: String(parsed.nameOfWork || '').trim(),
    loaNoAndDate: String(parsed.loaNoAndDate || '').trim(),
    orderingAuthority: String(parsed.orderingAuthority || '').trim(),
    contractorName: String(parsed.contractorName || '').trim(),
    contractorShortName: String(parsed.contractorShortName || '').trim(),
    consignee: String(parsed.consignee || '').trim(),
    inspectionChargesBy: String(parsed.inspectionChargesBy || 'Contractor').trim(),
    inspectionAuthority: String(parsed.inspectionAuthority || 'RDSO, Lucknow').trim(),
    contractValidity: String(parsed.contractValidity || '').trim(),
    forwardedLetterNo: String(parsed.forwardedLetterNo || '').trim(),
    letterDate: String(parsed.letterDate || '').trim(),
    firmNameAndPlace: defaultFirm,
    specificationNo: String(parsed.specificationNo || 'RDSO/SPN/217/2025 Version - 3.1 Or Latest').trim(),
    zone: String(parsed.zone || parsed.orderingAuthority || 'CKP').trim(),
    callLetter: String(parsed.forwardedLetterNo || parsed.loaNoAndDate || 'RDSO Call Letter').trim(),
    tenderName: String(parsed.nameOfWork || parsed.loaNoAndDate || '').trim(),
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    proformaRows,
    items,
    spares: DEFAULT_SPARES,
  };
}

/**
 * Helper to append full description with modelNo and serialNo for Annexure A & Dispatch Memo.
 */
function buildDescriptionWithModelAndSerial(item, includeSerial = true) {
  let desc = item.description || item.nomenclature || '';
  if (item.modelNo && !desc.includes(`(${item.modelNo})`)) {
    desc += ` (${item.modelNo})`;
  }
  if (includeSerial && item.serialNo) {
    desc += ` (Sr No. ${item.serialNo})`;
  }
  if (Array.isArray(item.subRows) && item.subRows.length > 0) {
    const subParts = item.subRows.map((sub, i) => {
      const prefix = i === 0 ? 'with' : 'and';
      let part = `${prefix} ${sub.nomenclature || ''}`;
      if (sub.modelNo) part += ` (${sub.modelNo})`;
      if (includeSerial && sub.serialNo) part += ` (Sr No. ${sub.serialNo})`;
      return part.trim();
    });
    desc += ` ${subParts.join(' ')}`;
  }
  return desc.trim();
}

function styleTableHeader(row, bgArgb = 'FF1E3A8A') {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function applyThinBorders(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    if (!cell.alignment) {
      cell.alignment = { vertical: 'top', wrapText: true };
    }
  });
}

/**
 * Ensures that even if an older record has unsplit composite items in `doc.items`,
 * the Offer/Packing List items are automatically expanded from the description.
 */
function resolveProformaAndPackingItems(doc = {}, defaultFirm = '') {
  const rawItems = Array.isArray(doc.items) ? doc.items : [];
  const rawProforma = Array.isArray(doc.proformaRows) && doc.proformaRows.length ? doc.proformaRows : rawItems;

  // Check if rawItems has a composite unsplit row (e.g. 1 row containing "consisting of 01no. Control panel, 01 Flasher...")
  const needsAutoExpand =
    rawItems.length > 0 &&
    rawItems.some((it) => {
      const constituents = extractConstituentItemsFromDescription(it.description);
      return constituents && constituents.length >= 2 && rawItems.length < constituents.length;
    });

  const basePackingItems = needsAutoExpand
    ? buildPackingItemsFromRows(rawItems, [], defaultFirm)
    : rawItems;

  // Normalize every item against the standard Notofire RDSO Nomenclature & Model No. catalog
  const packingItems = basePackingItems.map((it) => {
    const nom = String(it.nomenclature || '').trim();
    const mult = Number(it.scheduleMultiplier) || 1;
    const perSet = Number(it.qtyPerSet) || 0;
    const rawQtyVal = Number(it.qtyValue) || Number(String(it.qty || '').replace(/[^0-9.]/g, '')) || 0;
    const qtyVal = mult > 1 && perSet > 0 && rawQtyVal === perSet ? perSet * mult : rawQtyVal;
    const hasCleanNom = Boolean(nom && !/^supply[\s,]/i.test(nom) && nom.length <= 55);
    const meta = inferNotofireProductMeta(hasCleanNom ? nom : it.description || nom, qtyVal || 1, it.unit || 'Nos');
    const isMatchedCatalogItem = Boolean(meta.modelNo);
    const effectiveUnit = meta.unit || it.unit || 'Nos';
    const formattedQty = padQty(qtyVal, effectiveUnit);
    return {
      ...it,
      nomenclature: isMatchedCatalogItem || !hasCleanNom ? meta.nomenclature : nom,
      modelNo: it.modelNo || meta.modelNo,
      unit: effectiveUnit,
      qtyValue: qtyVal,
      qty: formattedQty,
      qtyOnOrder: formattedQty,
      qtyOffered: formattedQty,
      qtyAccepted: formattedQty,
    };
  });

  return { proformaRows: rawProforma, items: packingItems };
}

/**
 * Generates the complete multi-sheet Excel workbook from extracted/edited Call Letter data.
 */
async function generateCallLetterExcelBuffer(doc = {}) {
  const wb = new ExcelJS.Workbook();
  const firmName =
    doc.firmNameAndPlace ||
    'OEM/Supplier: M/s Notifire Private Limited. Place of Inspection: Notifire Pvt. Ltd., C-146 Ground Floor, Sector 63, Noida-201301(U.P) INDIA';

  const { proformaRows, items } = resolveProformaAndPackingItems(doc, firmName);
  const spares = Array.isArray(doc.spares) && doc.spares.length ? doc.spares : DEFAULT_SPARES;
  const specNo = doc.specificationNo || 'RDSO/SPN/217/2025 Version - 3.1 Or Latest';
  const loa = doc.loaNoAndDate || '';
  const contractor = doc.contractorName || '';
  const contractorShort = doc.contractorShortName || '';
  const orderingAuth = doc.orderingAuthority || '';
  const consignee = doc.consignee || '';
  const docDate = doc.contractValidity || '';

  // =========================================================================
  // SHEET 1: Proforma (PDF Extracted Details)
  // =========================================================================
  const wsProforma = wb.addWorksheet('Proforma (PDF Extracted)');
  wsProforma.columns = [
    { width: 22 },
    { width: 68 },
    { width: 14 },
    { width: 18 },
    { width: 22 },
    { width: 18 },
    { width: 34 },
  ];

  const titleRow = wsProforma.addRow(['PROFORMA FOR FURNISHING PARTICULARS FOR RDSO MATERIALS TO BE SUPPLIED BY THE CONTRACTORS']);
  titleRow.getCell(1).font = { bold: true, size: 12, underline: true };
  wsProforma.mergeCells('A1:G1');
  titleRow.getCell(1).alignment = { horizontal: 'center' };
  wsProforma.addRow([]);

  const headerParticulars = [
    ['1. NAME OF THE WORK', doc.nameOfWork || doc.tenderName || ''],
    ['2. LOA / C. A NO. & Dtd', loa],
    ['3. ORDERING AUTHORITY', orderingAuth],
    ['4. NAME OF THE CONTRACTOR', contractor],
    ['5. CONSIGNEE', consignee],
    ['6. INSPECTION CHARGES TO BE PAID BY', doc.inspectionChargesBy || 'Contractor'],
    ['7. INSPECTION AUTHORITY', doc.inspectionAuthority || 'RDSO, Lucknow'],
    ['8. VALIDITY OF THE CONTRACT AGREEMENT', docDate],
    ['9. MATERIALS TO BE INSPECTED', ''],
  ];
  headerParticulars.forEach(([label, val]) => {
    const r = wsProforma.addRow([label, val]);
    r.getCell(1).font = { bold: true };
    wsProforma.mergeCells(`B${r.number}:G${r.number}`);
  });
  wsProforma.addRow([]);

  const pHead = wsProforma.addRow([
    "Item No of Sch. 'B'",
    'Description of material with Specn.',
    'Qty',
    'Deptt. Sch. Rate (Rs.)',
    'Accepted Rate',
    'Total Amount (Rs.)',
    'Name of the firm on which order is placed.',
  ]);
  styleTableHeader(pHead);

  let grandTotalCost = 0;
  proformaRows.forEach((item, idx) => {
    const lineTotal = (Number(item.qtyValue) || 0) * (Number(item.depttSchRate) || 0);
    grandTotalCost += lineTotal;
    const r = wsProforma.addRow([
      item.itemNoOfSchB || `Item ${idx + 1}`,
      item.description || item.nomenclature || '',
      item.qty || item.qtyOffered || '',
      Number(item.depttSchRate) || 0,
      item.acceptedRate || 'At Par',
      Math.round(lineTotal * 100) / 100,
      item.firmName || firmName,
    ]);
    r.getCell(4).numFmt = '#,##0.00';
    r.getCell(6).numFmt = '#,##0.00';
    applyThinBorders(r);
  });

  const pTotal = wsProforma.addRow(['', 'TOTAL MATERIAL VALUE', '', '', '', Math.round(grandTotalCost * 100) / 100, '']);
  pTotal.getCell(2).font = { bold: true };
  pTotal.getCell(6).font = { bold: true };
  pTotal.getCell(6).numFmt = '#,##0.00';
  applyThinBorders(pTotal);

  if (doc.forwardedLetterNo || doc.letterDate) {
    wsProforma.addRow([]);
    wsProforma.addRow(['Forwarded Letter No.:', doc.forwardedLetterNo || '', 'Date:', doc.letterDate || '']);
  }

  // =========================================================================
  // Shared RDSO / QSHE Styling Helpers for OFFER PACKING LIST & OFFER LIST / ITR
  // =========================================================================
  const TNR_BLACK = { argb: 'FF000000' };
  const tnr = (size, bold = false) => ({ name: 'Times New Roman', size, bold, color: TNR_BLACK });
  const cambria = (size, bold = false) => ({ name: 'Cambria', size, bold, color: TNR_BLACK });
  const THIN_BLACK = { style: 'thin', color: TNR_BLACK };
  const ALL_THIN = { top: THIN_BLACK, left: THIN_BLACK, bottom: THIN_BLACK, right: THIN_BLACK };
  const applyBoxBorder = (ws, r1, c1, r2, c2) => {
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        const cell = ws.getCell(r, c);
        const border = { ...(cell.border || {}) };
        if (r === r1) border.top = THIN_BLACK;
        if (r === r2) border.bottom = THIN_BLACK;
        if (c === c1) border.left = THIN_BLACK;
        if (c === c2) border.right = THIN_BLACK;
        cell.border = border;
      }
    }
  };
  // Prevent Excel "Number Stored as Text" green corner triangles while preserving exact display (including leading zeros like 0968)
  const setCleanSerialValue = (cell, rawVal) => {
    const str = String(rawVal ?? '').trim();
    if (!str) {
      cell.value = '';
      return;
    }
    if (/^[1-9]\d{0,14}$/.test(str)) {
      cell.value = Number(str);
      cell.numFmt = '0';
      return;
    }
    if (/^0\d{1,14}$/.test(str)) {
      cell.value = Number(str);
      cell.numFmt = '0'.repeat(str.length);
      return;
    }
    cell.value = str;
  };

  // Compute dynamic minimum widths so 15pt Bold Times New Roman codes (e.g. CFMS-TCZ15) never wrap or clip
  const allOfferModelLens = [];
  const allOfferSerialLens = [];
  const allOfferQtyLens = [];
  items.forEach((it) => {
    allOfferModelLens.push(String(it.modelNo || '').length);
    allOfferSerialLens.push(String(it.serialNo || '').length);
    allOfferQtyLens.push(String(it.qtyOffered || it.qty || padQty(it.qtyValue, it.unit) || '').length);
    (it.subRows || []).forEach((sub) => {
      allOfferModelLens.push(String(sub.modelNo || '').length);
      allOfferSerialLens.push(String(sub.serialNo || '').length);
      allOfferQtyLens.push(String(sub.qtyOffered || padQty(sub.qtyValue, sub.unit) || '').length);
    });
  });
  spares.forEach((sp) => {
    allOfferSerialLens.push(String(sp.serialNo || '').length);
    allOfferQtyLens.push(String(sp.qty || '01 Nos').length);
  });

  const offerColCWidth = Math.max(24, Math.max(0, ...allOfferModelLens) * 1.9 + 5);
  const offerColDWidth = Math.max(48, Math.min(62, Math.max(0, ...allOfferSerialLens) * 1.6 + 6));
  const offerColEWidth = Math.max(22, Math.max(0, ...allOfferQtyLens) * 1.8 + 6);
  const offerSheetColumns = [
    { width: 13 },
    { width: 68 },
    { width: offerColCWidth },
    { width: offerColDWidth },
    { width: offerColEWidth },
  ];

  // Shared formatted Offer Table (header + items + subRow merges + Spare List)
  const appendFormattedOfferItemsAndSpares = (ws) => {
    // Table Column Headers (clean white background, bold black Times New Roman 12pt)
    const hRow = ws.addRow(['S. No.', 'Nomenclature', 'Model No.', 'Serial No.', 'Quantity']);
    hRow.height = 28;
    for (let c = 1; c <= 5; c += 1) {
      const cell = hRow.getCell(c);
      cell.font = tnr(12, true);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = ALL_THIN;
    }

    // Main Items
    items.forEach((item, idx) => {
      const subs = Array.isArray(item.subRows) ? item.subRows : [];
      const nomText = item.nomenclature || item.description || '';
      const mainRow = ws.addRow([
        idx + 1,
        nomText,
        item.modelNo || '',
        '',
        item.qtyOffered || item.qty || padQty(item.qtyValue, item.unit),
      ]);
      setCleanSerialValue(mainRow.getCell(4), item.serialNo || '');
      const estLines = Math.max(1, Math.ceil(String(nomText).length / 48));
      mainRow.height = subs.length > 0 ? 32 : Math.max(34, estLines * 24);

      mainRow.getCell(1).font = tnr(14, false);
      mainRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      mainRow.getCell(2).font = tnr(15, false);
      mainRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      mainRow.getCell(3).font = tnr(15, true);
      mainRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      mainRow.getCell(3).border = ALL_THIN;
      mainRow.getCell(4).font = tnr(15, true);
      mainRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      mainRow.getCell(4).border = ALL_THIN;
      mainRow.getCell(5).font = tnr(15, true);
      mainRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      mainRow.getCell(5).border = ALL_THIN;

      const startRowNum = mainRow.number;
      let endRowNum = startRowNum;

      subs.forEach((sub) => {
        const sr = ws.addRow([
          null,
          null,
          sub.modelNo || '',
          '',
          sub.qtyOffered || padQty(sub.qtyValue, sub.unit),
        ]);
        setCleanSerialValue(sr.getCell(4), sub.serialNo || '');
        sr.height = 32;
        sr.getCell(3).font = tnr(15, true);
        sr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        sr.getCell(3).border = ALL_THIN;
        sr.getCell(4).font = tnr(15, true);
        sr.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        sr.getCell(4).border = ALL_THIN;
        sr.getCell(5).font = tnr(15, true);
        sr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        sr.getCell(5).border = ALL_THIN;
        endRowNum = sr.number;
      });

      if (endRowNum > startRowNum) {
        ws.mergeCells(`A${startRowNum}:A${endRowNum}`);
        ws.mergeCells(`B${startRowNum}:B${endRowNum}`);
        applyBoxBorder(ws, startRowNum, 1, endRowNum, 1);
        applyBoxBorder(ws, startRowNum, 2, endRowNum, 2);
      } else {
        mainRow.getCell(1).border = ALL_THIN;
        mainRow.getCell(2).border = ALL_THIN;
      }
    });

    // Spare List Banner Row (A:E merged)
    const spBanner = ws.addRow([`Spare List as per Cl. No. 4.15 Of ${specNo}`, null, null, null, null]);
    spBanner.height = 32;
    ws.mergeCells(`A${spBanner.number}:E${spBanner.number}`);
    spBanner.getCell(1).font = tnr(13, true);
    spBanner.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBoxBorder(ws, spBanner.number, 1, spBanner.number, 5);

    const c4152List = spares.filter((s) => s.clause === '4.15.2');
    const c4151List = spares.filter((s) => s.clause !== '4.15.2');
    let spIdx = 1;

    const appendClauseHeader = (clauseText) => {
      const cr = ws.addRow([null, clauseText, null, null, null]);
      cr.height = 32;
      cr.getCell(1).border = ALL_THIN;
      ws.mergeCells(`B${cr.number}:E${cr.number}`);
      cr.getCell(2).font = tnr(12, true);
      cr.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      applyBoxBorder(ws, cr.number, 2, cr.number, 5);
    };

    const appendSpareGroup = (parentSp, subSpares = [], rowHeight = 30) => {
      const allInGroup = [parentSp, ...subSpares];
      const hasAnyModel = allInGroup.some((s) => String(s.modelNo || '').trim());
      const parentRow = ws.addRow([
        spIdx++,
        parentSp.nomenclature || '',
        hasAnyModel ? (parentSp.modelNo || '') : null,
        '',
        parentSp.qty || '01 Nos',
      ]);
      setCleanSerialValue(parentRow.getCell(4), parentSp.serialNo || '');
      parentRow.height = rowHeight;
      parentRow.getCell(1).font = tnr(14, false);
      parentRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      parentRow.getCell(2).font = tnr(15, false);
      parentRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      if (hasAnyModel) {
        parentRow.getCell(3).font = tnr(15, true);
        parentRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        parentRow.getCell(3).border = ALL_THIN;
      }
      parentRow.getCell(4).font = tnr(15, true);
      parentRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      parentRow.getCell(4).border = ALL_THIN;
      parentRow.getCell(5).font = tnr(15, true);
      parentRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      parentRow.getCell(5).border = ALL_THIN;

      const startRowNum = parentRow.number;
      let endRowNum = startRowNum;

      subSpares.forEach((subSp) => {
        const sr = ws.addRow([
          null,
          null,
          hasAnyModel ? (subSp.modelNo || '') : null,
          '',
          subSp.qty || '01 Nos',
        ]);
        setCleanSerialValue(sr.getCell(4), subSp.serialNo || '');
        sr.height = rowHeight;
        if (hasAnyModel) {
          sr.getCell(3).font = tnr(15, true);
          sr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
          sr.getCell(3).border = ALL_THIN;
        }
        sr.getCell(4).font = tnr(15, true);
        sr.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        sr.getCell(4).border = ALL_THIN;
        sr.getCell(5).font = tnr(15, true);
        sr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        sr.getCell(5).border = ALL_THIN;
        endRowNum = sr.number;
      });

      if (endRowNum > startRowNum) {
        ws.mergeCells(`A${startRowNum}:A${endRowNum}`);
        applyBoxBorder(ws, startRowNum, 1, endRowNum, 1);
        if (!hasAnyModel) {
          ws.mergeCells(`B${startRowNum}:C${endRowNum}`);
          applyBoxBorder(ws, startRowNum, 2, endRowNum, 3);
        } else {
          ws.mergeCells(`B${startRowNum}:B${endRowNum}`);
          applyBoxBorder(ws, startRowNum, 2, endRowNum, 2);
        }
      } else {
        parentRow.getCell(1).border = ALL_THIN;
        if (!hasAnyModel) {
          ws.mergeCells(`B${startRowNum}:C${startRowNum}`);
          applyBoxBorder(ws, startRowNum, 2, startRowNum, 3);
        } else {
          parentRow.getCell(2).border = ALL_THIN;
        }
      }
    };

    if (c4152List.length) {
      appendClauseHeader('Clause 4.15.2: CPU Card and Power Card (Maximum of One for Every Five) Installations or Minimum One)');
      c4152List.forEach((sp) => {
        appendSpareGroup(sp, [], 32);
      });
    }

    if (c4151List.length) {
      appendClauseHeader('Clause 4.15.1: 10% Spares for Modules, Detectors and Loop Cards for Each Installation');
      const grouped4151 = [];
      c4151List.forEach((sp) => {
        const isSub = String(sp.nomenclature || '').toLowerCase().includes('isolator (for spare');
        if (isSub && grouped4151.length > 0) {
          grouped4151[grouped4151.length - 1].subs.push(sp);
        } else {
          grouped4151.push({ parent: sp, subs: [] });
        }
      });
      grouped4151.forEach(({ parent, subs }) => {
        appendSpareGroup(parent, subs, subs.length > 0 ? 28 : 30);
      });
    }
  };

  // =========================================================================
  // SHEET 2: OFFER / PACKING LIST (exact RDSO / QSHE print-ready format)
  // =========================================================================
  const wsPacking = wb.addWorksheet('OFFER PACKING LIST', {
    views: [{ state: 'normal', showGridLines: true, zoomScale: 100 }],
    properties: { defaultRowHeight: 15.75, dyDescent: 0.25 },
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      orientation: 'portrait',
      horizontalCentered: true,
      verticalCentered: false,
      showGridLines: true,
      margins: { left: 0.25, right: 0.25, top: 0.37, bottom: 0.75, header: 0, footer: 0 },
    },
  });
  wsPacking.columns = offerSheetColumns;

  // Row 1: Contractor short name in E1 (no borders)
  const r1 = wsPacking.addRow([null, null, null, null, contractorShort]);
  r1.height = 24;
  r1.getCell(5).font = tnr(14, true);
  r1.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Company Name (A2:E2 merged)
  const r2 = wsPacking.addRow(['NOTOFIRE PRIVATE LIMITED', null, null, null, null]);
  r2.height = 26;
  wsPacking.mergeCells(`A${r2.number}:E${r2.number}`);
  r2.getCell(1).font = tnr(14, true);
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  applyBoxBorder(wsPacking, r2.number, 1, r2.number, 5);

  // Row 3: System Title (A3:E3 merged)
  const r3 = wsPacking.addRow(['Automatic Fire Detection & Alarm System for Signalling & Telecom Installation ( AFDAS )', null, null, null, null]);
  r3.height = 30;
  wsPacking.mergeCells(`A${r3.number}:E${r3.number}`);
  r3.getCell(1).font = tnr(13, true);
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  applyBoxBorder(wsPacking, r3.number, 1, r3.number, 5);

  // Row 4: Specification No. (A4:E4 merged)
  const r4 = wsPacking.addRow([`Specification No. :- ${specNo}`, null, null, null, null]);
  r4.height = 26;
  wsPacking.mergeCells(`A${r4.number}:E${r4.number}`);
  r4.getCell(1).font = tnr(12, true);
  r4.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  applyBoxBorder(wsPacking, r4.number, 1, r4.number, 5);

  // Row 5: LOA :- (A5 right-aligned, B5:E5 merged)
  const r5 = wsPacking.addRow(['LOA :- ', loa, null, null, null]);
  r5.height = Math.max(28, Math.ceil(String(loa || '').length / 95) * 22);
  wsPacking.mergeCells(`B${r5.number}:E${r5.number}`);
  r5.getCell(1).font = tnr(12, true);
  r5.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  r5.getCell(1).border = ALL_THIN;
  r5.getCell(2).font = tnr(12, true);
  r5.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  applyBoxBorder(wsPacking, r5.number, 2, r5.number, 5);

  // Row 6: OFFER/PACKING LIST (A6:E6 merged)
  const r6 = wsPacking.addRow(['OFFER/PACKING LIST', null, null, null, null]);
  r6.height = 26;
  wsPacking.mergeCells(`A${r6.number}:E${r6.number}`);
  r6.getCell(1).font = tnr(12, true);
  r6.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  applyBoxBorder(wsPacking, r6.number, 1, r6.number, 5);

  appendFormattedOfferItemsAndSpares(wsPacking);

  // =========================================================================
  // SHEET 3: OFFER LIST & INTERNAL TEST REPORT (exact QSHE CKP ITR format)
  // =========================================================================
  const wsOffer = wb.addWorksheet('OFFER LIST & TEST REPORT', {
    views: [{ state: 'normal', showGridLines: true, zoomScale: 100 }],
    properties: { defaultRowHeight: 15.75, dyDescent: 0.25 },
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      orientation: 'portrait',
      horizontalCentered: true,
      verticalCentered: false,
      showGridLines: false,
      margins: { left: 0.25, right: 0.25, top: 0.37, bottom: 0.75, header: 0, footer: 0 },
    },
  });
  wsOffer.columns = offerSheetColumns;

  // Row 1: Blank top spacer row (matches ITR reference)
  const o1 = wsOffer.addRow([null, null, null, null, null]);
  o1.height = 18;

  // Row 2: Company Name (A2:E2 merged)
  const o2 = wsOffer.addRow(['NOTOFIRE PRIVATE LIMITED', null, null, null, null]);
  o2.height = 26;
  wsOffer.mergeCells(`A${o2.number}:E${o2.number}`);
  o2.getCell(1).font = tnr(14, true);
  o2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  applyBoxBorder(wsOffer, o2.number, 1, o2.number, 5);

  // Row 3: System Title (A3:E3 merged)
  const o3 = wsOffer.addRow(['Automatic Fire Detection & Alarm System for Signalling & Telecom Installation ( AFDAS )', null, null, null, null]);
  o3.height = 30;
  wsOffer.mergeCells(`A${o3.number}:E${o3.number}`);
  o3.getCell(1).font = tnr(13, true);
  o3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  applyBoxBorder(wsOffer, o3.number, 1, o3.number, 5);

  // Row 4: Specification No. (A4:E4 merged)
  const o4 = wsOffer.addRow([`Specification No. :- ${specNo}`, null, null, null, null]);
  o4.height = 26;
  wsOffer.mergeCells(`A${o4.number}:E${o4.number}`);
  o4.getCell(1).font = tnr(12, true);
  o4.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  applyBoxBorder(wsOffer, o4.number, 1, o4.number, 5);

  // Helper for metadata rows (LOA, Contractor, Ordering Authority, Consignee, DOC)
  const appendOfferMetaRow = (label, value, labelAlign = 'center', minHeight = 26) => {
    const mr = wsOffer.addRow([label, value, null, null, null]);
    const valLines = Math.max(1, Math.ceil(String(value || '').length / 95));
    mr.height = Math.max(minHeight, valLines * 22);
    wsOffer.mergeCells(`B${mr.number}:E${mr.number}`);
    mr.getCell(1).font = tnr(12, true);
    mr.getCell(1).alignment = { horizontal: labelAlign, vertical: 'middle', wrapText: true };
    mr.getCell(1).border = ALL_THIN;
    mr.getCell(2).font = tnr(12, true);
    mr.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    applyBoxBorder(wsOffer, mr.number, 2, mr.number, 5);
  };

  // Rows 5–9: Metadata particulars
  appendOfferMetaRow('LOA :- ', loa, 'right', 28);
  appendOfferMetaRow('Contractor', contractor, 'center', 26);
  appendOfferMetaRow('Ordering Authority', orderingAuth, 'center', 36);
  appendOfferMetaRow('Consignee', consignee, 'center', 26);
  appendOfferMetaRow('DOC', docDate, 'center', 26);

  // Row 10: OFFER LIST banner (A10:E10 merged)
  const o10 = wsOffer.addRow(['OFFER LIST', null, null, null, null]);
  o10.height = 26;
  wsOffer.mergeCells(`A${o10.number}:E${o10.number}`);
  o10.getCell(1).font = tnr(12, true);
  o10.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  applyBoxBorder(wsOffer, o10.number, 1, o10.number, 5);

  // Rows 11+: Offer Items & Spare List (same clean formatting as OFFER PACKING LIST)
  appendFormattedOfferItemsAndSpares(wsOffer);

  // INTERNAL TEST REPORT section (immediately below Spare List, no blank gap)
  const trTitle = wsOffer.addRow(['INTERNAL TEST REPORT', null, null, null, null]);
  trTitle.height = 24;
  wsOffer.mergeCells(`A${trTitle.number}:E${trTitle.number}`);
  trTitle.getCell(1).font = tnr(12, true);
  trTitle.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  applyBoxBorder(wsOffer, trTitle.number, 1, trTitle.number, 5);

  // ITR Table Header Row (clean white background, Cambria 11pt Bold, thin borders)
  const trHead = wsOffer.addRow([null, 'Name of Test', 'Specified', 'Observed Value\n(Min. - Max.)', 'Results\n(OK/Not OK)']);
  trHead.height = 34;
  for (let c = 1; c <= 5; c += 1) {
    const cell = trHead.getCell(c);
    cell.font = cambria(11, true);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = ALL_THIN;
  }

  // ITR Test Rows
  const colBChars = 60;
  const colCChars = Math.max(18, Math.floor(offerColCWidth - 3));
  const colDChars = Math.max(38, Math.floor(offerColDWidth - 4));

  INTERNAL_TESTS.forEach((t) => {
    const sNoVal = t.isHeader && /^\d+$/.test(String(t.sNo)) ? Number(t.sNo) : t.sNo;
    const r = wsOffer.addRow([
      sNoVal,
      t.name,
      t.specified || null,
      t.observed || null,
      t.result || null,
    ]);

    if (t.isHeader) {
      r.height = 22;
      r.getCell(1).font = cambria(11, true);
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      r.getCell(2).font = cambria(11, true);
      r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let c = 3; c <= 5; c += 1) {
        r.getCell(c).font = cambria(11, false);
        r.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    } else {
      const bLines = Math.max(1, Math.ceil(String(t.name || '').length / colBChars));
      const cLines = Math.max(1, Math.ceil(String(t.specified || '').length / colCChars));
      const dLines = Math.max(1, Math.ceil(String(t.observed || '').length / colDChars));
      const maxLines = Math.max(bLines, cLines, dLines);
      r.height = Math.max(22, maxLines * 17 + 8);

      r.getCell(1).font = cambria(11, false);
      r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      r.getCell(2).font = cambria(11, false);
      r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      r.getCell(3).font = cambria(11, false);
      r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      r.getCell(4).font = cambria(11, false);
      r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      r.getCell(5).font = cambria(10.5, false);
      r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    for (let c = 1; c <= 5; c += 1) {
      r.getCell(c).border = ALL_THIN;
    }
  });

  // Footer: Declaration & Sign-off block (no borders, matches ITR screenshot)
  const spAfterTr1 = wsOffer.addRow([null, null, null, null, null]);
  spAfterTr1.height = 16;

  const declRow = wsOffer.addRow(['The material has been tested internally and found conforming / not conforming.', null, null, null, null]);
  declRow.height = 20;
  wsOffer.mergeCells(`A${declRow.number}:E${declRow.number}`);
  declRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: TNR_BLACK };
  declRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  const spAfterTr2 = wsOffer.addRow([null, null, null, null, null]);
  spAfterTr2.height = 16;

  const signRow = wsOffer.addRow(['Checked by-', null, 'Testing date-', 'Approved by-', null]);
  signRow.height = 22;
  const signFont = { name: 'Arial', size: 10, bold: false, color: TNR_BLACK };
  signRow.getCell(1).font = signFont;
  signRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  signRow.getCell(3).font = signFont;
  signRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
  signRow.getCell(4).font = signFont;
  signRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };

  // =========================================================================
  // SHEET 4: ACCEPTANCE TEST TOP SHEET (exact RDSO QS-F-8.1-6 / ATS format)
  // =========================================================================
  const wsTop = wb.addWorksheet('ACCEPTANCE TEST TOP SHEET', {
    views: [{ state: 'normal', showGridLines: true, zoomScale: 100 }],
    properties: { defaultRowHeight: 15.75, dyDescent: 0.25 },
    pageSetup: {
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      paperSize: 9,
      orientation: 'portrait',
      horizontalCentered: true,
      verticalCentered: false,
      showGridLines: false,
      margins: { left: 0.25, right: 0.25, top: 0.33, bottom: 0.75, header: 0, footer: 0 },
    },
  });
  wsTop.columns = [
    { width: 15.5 }, // A
    { width: 15.5 }, // B
    { width: 14 },   // C
    { width: 14 },   // D
    { width: 14 },   // E
    { width: 14 },   // F
    { width: 14 },   // G
    { width: 14.5 }, // H
    { width: 22 },   // I
    { width: 16 },   // J
    { width: 14.5 }, // K
    { width: 16 },   // L
  ];

  // Pre-allocate Rows 1–62 cleanly so exact cell coordinates match the RDSO QS-F-8.1-6 grid
  for (let r = 1; r <= 62; r += 1) {
    wsTop.getRow(r).height = 24;
  }
  const setTopMergedBox = (range, value, opts = {}) => {
    const {
      size = 13,
      bold = true,
      horizontal = 'center',
      vertical = 'middle',
      wrapText = true,
      border = true,
      numFmt = null,
    } = opts;
    const [startRef, endRef] = range.includes(':') ? range.split(':') : [range, range];
    if (startRef !== endRef) {
      wsTop.mergeCells(`${startRef}:${endRef}`);
    }
    const cell = wsTop.getCell(startRef);
    cell.value = value;
    cell.font = tnr(size, bold);
    cell.alignment = { horizontal, vertical, wrapText };
    if (numFmt) cell.numFmt = numFmt;
    if (border) {
      const startCell = wsTop.getCell(startRef);
      const endCell = wsTop.getCell(endRef);
      applyBoxBorder(wsTop, startCell.row, startCell.col, endCell.row, endCell.col);
    }
    return cell;
  };

  // Row 1: Top blank margin row
  wsTop.getRow(1).height = 12;

  // Row 2: ISO9001:2015 | Document No. QS-F-8.1-6 | Version No.: 1.0 | Date Effective: 14.09.2018
  wsTop.getRow(2).height = 24;
  setTopMergedBox('A2:C2', 'ISO9001:2015');
  setTopMergedBox('D2:G2', 'Document No. QS-F-8.1-6');
  setTopMergedBox('H2:I2', 'Version No.: 1.0');
  setTopMergedBox('J2:L2', 'Date Effective: 14.09.2018');

  // Row 3: Document Title
  wsTop.getRow(3).height = 24;
  setTopMergedBox('A3:L3', 'Document Title : Format for acceptance test top sheet', { horizontal: 'left' });

  // Rows 4–7: Title Block (inside outer A4:L7 border)
  wsTop.getRow(4).height = 14;
  wsTop.getRow(5).height = 26;
  wsTop.getRow(6).height = 24;
  wsTop.getRow(7).height = 20;
  setTopMergedBox('E5:H5', 'ACCEPTANCE TEST TOP SHEET', { border: false });
  if (doc.topSheetNumber) {
    setTopMergedBox('J5:K5', doc.topSheetNumber, { size: 17, border: false });
  }
  setTopMergedBox('E6:H6', '(To be filled in by Inspecting Official)', { border: false });
  applyBoxBorder(wsTop, 4, 1, 7, 12);

  // Rows 8–10: Call Letter No. / Date | Date of Inspection | Inspecting Official
  wsTop.getRow(8).height = 24;
  wsTop.getRow(9).height = 18;
  wsTop.getRow(10).height = 18;
  setTopMergedBox('A8:D8', 'Call Letter No. / Date');
  setTopMergedBox('E8:H8', 'Date of Inspection');
  setTopMergedBox('I8:L8', 'Inspecting Official');
  setTopMergedBox('A9:D10', doc.callLetterNoAndDate || doc.forwardedLetterNo || '', { size: 14 });
  setTopMergedBox('E9:H10', doc.dateOfInspection || '', { size: 13 });
  setTopMergedBox('I9:L10', doc.inspectingOfficial || '', { size: 14 });

  // Row 11: Separator strip
  wsTop.getRow(11).height = 13;
  setTopMergedBox('A11:L11', null);

  // Rows 12–16: Manufacturer's Name | Contractor's Name
  wsTop.getRow(12).height = 24;
  wsTop.getRow(13).height = 20;
  wsTop.getRow(14).height = 20;
  wsTop.getRow(15).height = 20;
  wsTop.getRow(16).height = 20;
  setTopMergedBox('A12:F12', "Manufacturer's Name");
  setTopMergedBox('G12:L12', "Contractor's Name");
  setTopMergedBox(
    'A13:F16',
    'Notofire Private Limited, C-146, Ground Floor, Block C,\nSector 63 Noida, Gautam Budh Nagar, Uttar Pradesh,\nINDIA - 201301',
    { size: 13 }
  );
  setTopMergedBox('G13:L16', contractor, { size: 13 });

  // Row 17: Separator strip
  wsTop.getRow(17).height = 13;
  setTopMergedBox('A17:L17', null);

  // Rows 18–20: P.O. / CA No. & Date | Ordering Authority | Consignee | Delivery Period
  wsTop.getRow(18).height = 24;
  wsTop.getRow(19).height = 38;
  wsTop.getRow(20).height = 38;
  setTopMergedBox('A18:C18', 'P.O. / CA No. & Date');
  setTopMergedBox('D18:G18', 'Ordering Authority');
  setTopMergedBox('H18:J18', 'Consignee');
  setTopMergedBox('K18:L18', 'Delivery Period');
  setTopMergedBox('A19:C20', loa, { size: 12 });
  setTopMergedBox('D19:G20', orderingAuth, { size: 14 });
  setTopMergedBox('H19:J20', consignee, { size: 14 });
  setTopMergedBox('K19:L20', docDate, { size: 14 });

  // Row 21: Separator strip
  wsTop.getRow(21).height = 13;
  setTopMergedBox('A21:L21', null);

  // Rows 22–27: S. No. | ITEM DESCRIPTION | Quantity (On Order / Now Offered / Now Accepted / Rejected / Consumed in Testing)
  wsTop.getRow(22).height = 24;
  wsTop.getRow(23).height = 20;
  wsTop.getRow(24).height = 20;
  wsTop.getRow(25).height = 18;
  wsTop.getRow(26).height = 18;
  wsTop.getRow(27).height = 18;
  setTopMergedBox('A22:A23', 'S. No.');
  setTopMergedBox('B22:G23', 'ITEM DESCRIPTION');
  setTopMergedBox('H22:L22', 'Quantity');
  setTopMergedBox('H23:H24', 'On Order', { size: 12 });
  setTopMergedBox('I23:I24', 'Now Offered', { size: 12 });
  setTopMergedBox('J23:J24', 'Now Accepted', { size: 12 });
  setTopMergedBox('K23:K24', 'Rejected', { size: 12 });
  setTopMergedBox('L23:L24', 'Consumed in Testing', { size: 12 });
  setTopMergedBox('A24:A27', null);
  setTopMergedBox('B24:G27', 'As per Annexure "A" Attached');
  setTopMergedBox('H25:L27', 'As per Annexure "A" Attached');

  // Row 28: Separator strip
  wsTop.getRow(28).height = 13;
  setTopMergedBox('A28:L28', null);

  // Rows 29–30: Details of IC / RA issued for material previously accepted / rejected
  wsTop.getRow(29).height = 24;
  wsTop.getRow(30).height = 24;
  setTopMergedBox('A29:G29', 'Details of IC / RA issued for material previously accepted / rejected', { horizontal: 'left' });
  setTopMergedBox('H29:L29', null);
  setTopMergedBox('A30', 'S. No');
  setTopMergedBox('B30:F30', 'IC / RA No. & Date');
  setTopMergedBox('G30:I30', 'Consignee');
  setTopMergedBox('J30', 'Qty');
  setTopMergedBox('K30:L30', 'Reason for Rejection');

  // Row 31: Separator strip
  wsTop.getRow(31).height = 13;
  setTopMergedBox('A31:L31', null);

  // Rows 32–34: Specification No. of Type Approval
  wsTop.getRow(32).height = 24;
  wsTop.getRow(33).height = 16;
  wsTop.getRow(34).height = 16;
  setTopMergedBox('A32:D32', 'Specification No. of Type Approval', { horizontal: 'left' });
  setTopMergedBox('E32:L32', null);
  setTopMergedBox('A33:L34', specNo, { horizontal: 'left' });

  // Rows 35–36: ISO Validity | Digital Signature Certificate No.
  wsTop.getRow(35).height = 24;
  wsTop.getRow(36).height = 24;
  setTopMergedBox('A35:F35', 'ISO Validity');
  setTopMergedBox('G35:L35', 'Digital Signature Certificate No.');
  setTopMergedBox('A36:F36', doc.isoValidity || '14.11.2028');
  setTopMergedBox('G36:L36', doc.dscNo || '70d7e379b55ef269');

  // Rows 37–40: Details of Inspection charges (clean white RDSO format, no blue fill)
  const matCost = Number(doc.totalMaterialCost) || grandTotalCost || 0;
  const inspCharge = Math.round(matCost * 0.01 * 100) / 100;
  const gstAmt = Math.round(inspCharge * 0.18 * 100) / 100;
  const totalInspAmt = Math.round((inspCharge + gstAmt) * 100) / 100;

  wsTop.getRow(37).height = 24;
  wsTop.getRow(38).height = 24;
  wsTop.getRow(39).height = 38;
  wsTop.getRow(40).height = 26;
  setTopMergedBox('A37:C37', 'Details of Inspection charges', { horizontal: 'left' });
  setTopMergedBox('D37:L37', null);

  setTopMergedBox('A38:A39', 'Total cost of material', { size: 12 });
  setTopMergedBox('B38:J38', 'Inspection Charges');
  setTopMergedBox('K38:L39', 'GSTIN no.of Payer', { size: 12 });
  setTopMergedBox('B39', 'Inspection Charges', { size: 12 });
  setTopMergedBox('C39:D39', 'GST Rate on Insp.', { size: 12 });
  setTopMergedBox('E39:F39', 'GST Amount', { size: 12 });
  setTopMergedBox('G39:H39', 'Total Amount', { size: 12 });
  setTopMergedBox('I39', 'SB Collect Ref. no.', { size: 12 });
  setTopMergedBox('J39', 'Date', { size: 12 });

  setTopMergedBox('A40', matCost, { size: 13, numFmt: '#,##0.00' });
  setTopMergedBox('B40', { formula: 'ROUND(A40*0.01,2)', result: inspCharge }, { size: 13, numFmt: '#,##0.00' });
  setTopMergedBox('C40:D40', 0.18, { size: 13, numFmt: '0%' });
  setTopMergedBox('E40:F40', { formula: 'ROUND(B40*C40,2)', result: gstAmt }, { size: 13, numFmt: '#,##0.00' });
  setTopMergedBox('G40:H40', { formula: 'ROUND(E40+B40,2)', result: totalInspAmt }, { size: 13, numFmt: '#,##0.00' });
  setTopMergedBox('I40', doc.sbCollectRefNo || '', { size: 13 });
  setTopMergedBox('J40', doc.sbCollectDate || '', { size: 13 });
  setTopMergedBox('K40:L40', doc.payerGstin || '09AAGCN7119L1Z0', { size: 13 });

  // Row 41: Separator strip
  wsTop.getRow(41).height = 13;
  setTopMergedBox('A41:L41', null);

  // Rows 42–44: Details of Short Length
  wsTop.getRow(42).height = 24;
  wsTop.getRow(43).height = 24;
  wsTop.getRow(44).height = 24;
  setTopMergedBox('A42:C42', 'Details of Short Length', { horizontal: 'left' });
  setTopMergedBox('D42:L42', null);
  setTopMergedBox('A43:C43', 'Permissible');
  setTopMergedBox('D43:F43', 'Already Supplied');
  setTopMergedBox('G43:I43', 'Now Accepted');
  setTopMergedBox('J43:L43', 'Total');
  setTopMergedBox('A44:C44', 'NIL');
  setTopMergedBox('D44:F44', 'NIL');
  setTopMergedBox('G44:I44', 'NIL');
  setTopMergedBox('J44:L44', 'NIL');

  // Row 45: Separator strip
  wsTop.getRow(45).height = 13;
  setTopMergedBox('A45:L45', null);

  // Rows 46–49: Packing Details
  wsTop.getRow(46).height = 24;
  wsTop.getRow(47).height = 24;
  wsTop.getRow(48).height = 16;
  wsTop.getRow(49).height = 16;
  setTopMergedBox('A46:B46', 'Packing Details', { horizontal: 'left' });
  setTopMergedBox('C46:L46', null);
  setTopMergedBox('A47:D47', 'Consignee');
  setTopMergedBox('E47:H47', 'Sr. No Details');
  setTopMergedBox('I47:L47', 'Mode of Stamping / Sealing');
  setTopMergedBox('A48:L49', 'As per Annexure "B" Attached');

  // Rows 50–53: Routine Test & Acceptance Checklist block (inside outer A50:L53 border)
  wsTop.getRow(50).height = 24;
  wsTop.getRow(51).height = 24;
  wsTop.getRow(52).height = 24;
  wsTop.getRow(53).height = 13;
  setTopMergedBox('B50:I50', 'Whether routine test reports have been submitted along with call letter ?', { horizontal: 'left', border: false });
  setTopMergedBox('J50', 'YES / No', { horizontal: 'center', border: false });
  setTopMergedBox('K50', 'Yes', { size: 12, horizontal: 'left', border: false });
  setTopMergedBox('B51:I51', 'Whether sample check of routine test results have been conducted?', { horizontal: 'left', border: false });
  setTopMergedBox('J51', 'YES / No', { horizontal: 'center', border: false });
  setTopMergedBox('K51', 'Yes', { size: 12, horizontal: 'left', border: false });
  setTopMergedBox('B52:L52', 'Material passes / does not pass the acceptance test, paper put up for approval and issue of IC / RA please.', { horizontal: 'left', border: false });
  applyBoxBorder(wsTop, 50, 1, 53, 12);

  // Rows 54–56: Test Reports and Date | I.C. / R. A. No. & Date
  wsTop.getRow(54).height = 24;
  wsTop.getRow(55).height = 18;
  wsTop.getRow(56).height = 18;
  setTopMergedBox('A54:F54', 'Test Reports and Date');
  setTopMergedBox('G54:L54', 'I.C. / R. A. No. & Date');
  setTopMergedBox('A55:F56', doc.testReportRef || 'SI-F-7.1-0296 VER. NO. 1.3 DATED 25.02.2026');
  setTopMergedBox('G55:L56', doc.icRaNoAndDate || '');

  // Rows 57–60: Stamp & Official Signatures block (inside outer A57:L60 border)
  wsTop.getRow(57).height = 24;
  wsTop.getRow(58).height = 24;
  wsTop.getRow(59).height = 24;
  wsTop.getRow(60).height = 16;
  setTopMergedBox('E57:G57', 'Facsimile of Stamp Used', { border: false });
  setTopMergedBox('A58:D58', '(Signature of Inspecting Official)', { horizontal: 'left', border: false });
  setTopMergedBox('I58:L58', '(Signature of test check conducting official)', { horizontal: 'center', border: false });
  setTopMergedBox('A59:D59', 'with Designation & Date', { horizontal: 'left', border: false });
  setTopMergedBox('I59:L59', 'with Designation & Date', { horizontal: 'center', border: false });
  applyBoxBorder(wsTop, 57, 1, 60, 12);

  // Rows 61–62: Footer bar (RDSO/Quality Assurance/ S&T | Printed on 14.09.2018 / Page 1 of 1)
  wsTop.getRow(61).height = 24;
  wsTop.getRow(62).height = 24;
  setTopMergedBox('A61:H62', 'RDSO/Quality Assurance/ S&T');
  setTopMergedBox('I61:L61', 'Printed on 14.09.2018');
  setTopMergedBox('I62:L62', 'Page 1 of 1');

  // =========================================================================
  // SHEET 5: Acceptance Top Sheet Annexure "A"
  // =========================================================================
  const wsAnnA = wb.addWorksheet('Annexure A');
  wsAnnA.columns = [
    { width: 10 },
    { width: 70 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
  ];
  wsAnnA.addRow(['Acceptance Top Sheet Annexure "A"']).getCell(1).font = { bold: true, size: 12 };
  const annAHead = wsAnnA.addRow([
    'S. No.',
    'ITEM DESCRIPTION',
    'Qty. on order',
    'Qty. now offered',
    'Qty. accepted',
    'Rejected',
    'Consumed in Testing',
    'Deptt. Sch. Rate',
    'Accepted Rate',
  ]);
  styleTableHeader(annAHead);

  items.forEach((item, idx) => {
    const r = wsAnnA.addRow([
      idx + 1,
      buildDescriptionWithModelAndSerial(item, true),
      item.qtyOnOrder || item.qty || '',
      item.qtyOffered || item.qty || '',
      item.qtyAccepted || item.qty || '',
      'Nil',
      0,
      Number(item.depttSchRate) || 0,
      item.acceptedRate || 'At Par',
    ]);
    r.getCell(8).numFmt = '#,##0.00';
    applyThinBorders(r);

    (item.subRows || []).forEach((sub) => {
      const sr = wsAnnA.addRow(['', '', sub.qtyOnOrder || '', sub.qtyOffered || '', sub.qtyAccepted || '', 'Nil', 0, '', '']);
      applyThinBorders(sr);
    });
  });

  wsAnnA.addRow([`Spare List as per Cl. No. 4.15 Of ${specNo}`]).getCell(1).font = { bold: true };
  spares.forEach((sp, i) => {
    const r = wsAnnA.addRow([
      i + 1,
      `${sp.nomenclature}${sp.serialNo ? ` (Sr. No. ${sp.serialNo})` : ''}`,
      '',
      sp.qty || '01 Nos',
      sp.qty || '01 Nos',
      'Nil',
      0,
      '',
      '',
    ]);
    applyThinBorders(r);
  });

  // =========================================================================
  // SHEET 6: Acceptance Top Sheet Annexure "B"
  // =========================================================================
  const wsAnnB = wb.addWorksheet('Annexure B');
  wsAnnB.columns = [{ width: 22 }, { width: 68 }, { width: 28 }, { width: 30 }];
  wsAnnB.addRow(['Acceptance Top Sheet Annexure "B"']).getCell(1).font = { bold: true, size: 12 };
  const annBHead = wsAnnB.addRow(['Consignee', 'ITEM DESCRIPTION', 'Sr. No Details', 'Mode of Stamping / Sealing']);
  styleTableHeader(annBHead);

  items.forEach((item, idx) => {
    const r = wsAnnB.addRow([
      idx === 0 ? consignee : '',
      buildDescriptionWithModelAndSerial(item, false),
      item.serialNo || '',
      item.hologram || '',
    ]);
    applyThinBorders(r);
    (item.subRows || []).forEach((sub) => {
      const sr = wsAnnB.addRow(['', '', sub.serialNo || '', sub.hologram || '']);
      applyThinBorders(sr);
    });
  });

  wsAnnB.addRow([`Spare List as per Cl. No. 4.15 Of ${specNo}`]).getCell(1).font = { bold: true };
  spares.forEach((sp, i) => {
    const r = wsAnnB.addRow([i === 0 ? consignee : '', sp.nomenclature, sp.serialNo || '', sp.hologram || '']);
    applyThinBorders(r);
  });

  // =========================================================================
  // SHEET 7: Annexure to IC
  // =========================================================================
  const wsIc = wb.addWorksheet('Annexure to IC');
  wsIc.columns = [
    { width: 20 },
    { width: 64 },
    { width: 28 },
    { width: 15 },
    { width: 18 },
    { width: 15 },
    { width: 15 },
    { width: 26 },
    { width: 28 },
  ];
  wsIc.addRow(['Annexure to IC']).getCell(1).font = { bold: true, size: 12 };
  wsIc.addRow(['LOA No.', loa]).getCell(1).font = { bold: true };
  const icTableHead = wsIc.addRow([
    'Consignee',
    'ITEM DESCRIPTION',
    'ITEM NAME',
    'Qty. on order',
    'Qty. previously passed',
    'Qty. now offered',
    'Qty. accepted',
    'Remark',
    'Hologram',
  ]);
  styleTableHeader(icTableHead);

  items.forEach((item, idx) => {
    const r = wsIc.addRow([
      idx === 0 ? consignee : '',
      buildDescriptionWithModelAndSerial(item, false),
      item.nomenclature || '',
      item.qtyOnOrder || item.qty || '',
      'NIL',
      item.qtyOffered || item.qty || '',
      item.qtyAccepted || item.qty || '',
      item.serialNo || '',
      item.hologram || '',
    ]);
    applyThinBorders(r);
    (item.subRows || []).forEach((sub) => {
      const sr = wsIc.addRow([
        '',
        '',
        sub.nomenclature || '',
        sub.qtyOnOrder || '',
        'NIL',
        sub.qtyOffered || '',
        sub.qtyAccepted || '',
        sub.serialNo || '',
        sub.hologram || '',
      ]);
      applyThinBorders(sr);
    });
  });

  wsIc.addRow([`Spare List as per Cl. No. 4.15 Of ${specNo}`]).getCell(1).font = { bold: true };
  spares.forEach((sp, i) => {
    const r = wsIc.addRow([
      i === 0 ? consignee : '',
      sp.nomenclature,
      '',
      sp.qty || '01 Nos',
      'NIL',
      sp.qty || '01 Nos',
      sp.qty || '01 Nos',
      sp.serialNo || '',
      sp.hologram || '',
    ]);
    applyThinBorders(r);
  });

  // =========================================================================
  // SHEET 8: GUARANTEE CERTIFICATE
  // =========================================================================
  const wsGc = wb.addWorksheet('GUARANTEE CERTIFICATE');
  wsGc.columns = [{ width: 14 }, { width: 68 }, { width: 28 }, { width: 14 }, { width: 12 }];
  wsGc.addRow(['C-146, GROUND FLOOR, BLOCK C, SECTOR 63, NOIDA, U.P (INDIA) 201301']).getCell(1).font = { bold: true };
  wsGc.addRow(['GSTIN: 09AAGCN7119L1Z0   CIN : U29100UP2019PTC122206']);
  wsGc.addRow(['GUARANTEE CERTIFICATE']).getCell(1).font = { bold: true, size: 12 };
  wsGc.addRow(['Certificate No.', doc.guaranteeCertificateNo || 'NF/AFDAS/2026-27/0832']);
  wsGc.addRow(['Date of Issue:', doc.guaranteeIssueDate || doc.letterDate || '']);

  const gcHead = wsGc.addRow(['Serial Nos.', 'ITEM DESCRIPTION', 'Unit S. No.', 'Quantity', 'Unit']);
  styleTableHeader(gcHead);

  items.forEach((item, idx) => {
    const r = wsGc.addRow([
      idx + 1,
      buildDescriptionWithModelAndSerial(item, false),
      item.serialNo || '',
      item.qtyValue || item.qty || '',
      item.unit || '',
    ]);
    applyThinBorders(r);
    (item.subRows || []).forEach((sub) => {
      const sr = wsGc.addRow(['', '', sub.serialNo || '', sub.qtyValue || '', sub.unit || 'Nos']);
      applyThinBorders(sr);
    });
  });

  wsGc.addRow([`Spare List as per Cl. No. 4.15 Of ${specNo}`]).getCell(1).font = { bold: true };
  spares.forEach((sp, i) => {
    const r = wsGc.addRow([i + 1, sp.nomenclature, sp.serialNo || '', sp.qtyValue || 1, sp.unit || 'Nos']);
    applyThinBorders(r);
  });

  wsGc.addRow([]);
  wsGc.addRow(['ORDERING AUTHORITY:', orderingAuth]);
  wsGc.addRow(['CONSIGNEE:', consignee]);
  wsGc.addRow(['CONTRACTOR:', contractor]);
  wsGc.addRow(['CONTRACT / ORDER NO. :', loa]);
  const wRow = wsGc.addRow([WARRANTY_TEXT]);
  wsGc.mergeCells(`A${wRow.number}:E${wRow.number}`);
  wRow.getCell(1).alignment = { wrapText: true };
  wRow.height = 240;
  wsGc.addRow([]);
  wsGc.addRow(['', '', '', 'For Notofire Private Limited']);
  wsGc.addRow(['', '', '', 'Auth. Sign.']);

  // =========================================================================
  // SHEET 9: DISPATCH MEMO ANNEXURE
  // =========================================================================
  const wsDm = wb.addWorksheet('DISPATCH MEMO ANNEXURE');
  wsDm.columns = [
    { width: 10 },
    { width: 68 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 28 },
  ];
  wsDm.addRow(['DISPATCH MEMO ANNEXURE']).getCell(1).font = { bold: true, size: 12 };
  wsDm.addRow(['PO No.: LOA No.', loa]);
  wsDm.addRow(['Ordering Placed by: -', orderingAuth]);
  wsDm.addRow(['Consignee: - :', consignee]);

  const dmHead = wsDm.addRow([
    'Sr. No.',
    'Brief Particulars of Stores',
    'Qty. Tendered',
    'Qty. Accepted',
    'Qty Due',
    'Rejected',
    'Remark/Sl. No.',
  ]);
  styleTableHeader(dmHead);

  items.forEach((item, idx) => {
    const numOrder = Number(String(item.qtyOnOrder || '').replace(/[^0-9.]/g, '')) || item.qtyValue || 0;
    const numAcc = Number(String(item.qtyAccepted || '').replace(/[^0-9.]/g, '')) || item.qtyValue || 0;
    const diff = Math.max(numOrder - numAcc, 0);
    const dueStr = diff > 0 ? padQty(diff, item.unit) : 'Nil';

    const r = wsDm.addRow([
      idx + 1,
      buildDescriptionWithModelAndSerial(item, true),
      item.qtyOnOrder || item.qty || '',
      item.qtyAccepted || item.qty || '',
      dueStr,
      'Nil',
      'Hologram pasted on each device',
    ]);
    applyThinBorders(r);

    (item.subRows || []).forEach((sub) => {
      const sr = wsDm.addRow(['', '', sub.qtyOnOrder || '', sub.qtyAccepted || '', 'Nil', 'Nil', 'Hologram pasted on each device']);
      applyThinBorders(sr);
    });
  });

  wsDm.addRow([`Spare List as per Cl. No. 4.15 Of ${specNo}`]).getCell(1).font = { bold: true };
  spares.forEach((sp, i) => {
    const r = wsDm.addRow([
      i + 1,
      `${sp.nomenclature}${sp.serialNo ? ` (Sr. No. ${sp.serialNo})` : ''}`,
      sp.qty || '01 Nos',
      sp.qty || '01 Nos',
      'Nil',
      'Nil',
      'Hologram pasted on each device',
    ]);
    applyThinBorders(r);
  });

  return wb.xlsx.writeBuffer();
}

module.exports = {
  parseCallLetterPdfWithGemini,
  generateCallLetterExcelBuffer,
  extractConstituentItemsFromDescription,
  inferNotofireProductMeta,
  DEFAULT_SPARES,
};
