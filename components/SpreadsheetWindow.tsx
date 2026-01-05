import React, { useEffect, useRef } from 'react';
import { LocaleType, IWorkbookData, mergeLocales } from '@univerjs/core';
import { createUniver } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/lib/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';

// Expense report data - missing the "Office Supplies" row that should be in the total
const EXPENSE_REPORT_DATA: IWorkbookData = {
  id: 'expense-report',
  name: 'Q4 Expense Report',
  appVersion: '0.1.0',
  locale: LocaleType.EN_US,
  styles: {},
  sheetOrder: ['sheet1'],
  sheets: {
    sheet1: {
      id: 'sheet1',
      name: 'Expenses',
      rowCount: 20,
      columnCount: 10,
      defaultColumnWidth: 120,
      defaultRowHeight: 24,
      cellData: {
        0: {
          0: { v: 'Q4 Expense Report' },
        },
        1: {
          0: { v: 'Category' },
          1: { v: 'October' },
          2: { v: 'November' },
          3: { v: 'December' },
          4: { v: 'Total' },
        },
        2: {
          0: { v: 'Travel' },
          1: { v: 2500 },
          2: { v: 1800 },
          3: { v: 3200 },
          4: { f: '=SUM(B3:D3)' },
        },
        3: {
          0: { v: 'Software' },
          1: { v: 899 },
          2: { v: 450 },
          3: { v: 899 },
          4: { f: '=SUM(B4:D4)' },
        },
        4: {
          0: { v: 'Marketing' },
          1: { v: 5000 },
          2: { v: 7500 },
          3: { v: 4200 },
          4: { f: '=SUM(B5:D5)' },
        },
        5: {
          0: { v: 'Office Supplies' },
          1: { v: 340 },
          2: { v: 285 },
          3: { v: 410 },
          4: { f: '=SUM(B6:D6)' },
        },
        6: {},
        7: {
          0: { v: 'Grand Total' },
          // BUG: This formula is missing row 6 (Office Supplies)!
          4: { f: '=SUM(E3:E5)' },
        },
      },
      rowData: {},
      columnData: {
        0: { w: 140 },
        1: { w: 100 },
        2: { w: 100 },
        3: { w: 100 },
        4: { w: 100 },
      },
      showGridlines: 1,
      freeze: { startRow: -1, startColumn: -1, xSplit: 0, ySplit: 0 },
      mergeData: [],
      tabColor: '',
      hidden: 0,
      zoomRatio: 1,
      scrollTop: 0,
      scrollLeft: 0,
      rightToLeft: 0,
      rowHeader: { width: 46, hidden: 0 },
      columnHeader: { height: 20, hidden: 0 },
    },
  },
};

interface SpreadsheetWindowProps {
  className?: string;
  style?: React.CSSProperties;
}

export const SpreadsheetWindow: React.FC<SpreadsheetWindowProps> = ({ className, style }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
      },
      presets: [
        UniverSheetsCorePreset({
          container: containerRef.current,
        }),
      ],
    });

    // Create workbook with expense data
    univerAPI.createWorkbook(EXPENSE_REPORT_DATA);

    return () => {
      univerAPI.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        ...style,
      }}
    />
  );
};
