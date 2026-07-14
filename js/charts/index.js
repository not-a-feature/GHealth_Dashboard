/* Hand-rolled SVG charts for the GHealth dashboard.
   Specs: bars ≤24px with 4px rounded data-end (square at baseline), 2px lines,
   ≥8px end markers with a 2px surface ring, hairline solid gridlines, hover
   tooltips on every chart, and stacked segments separated by 2px surface gaps. */

import { emptyNote, compact, fmtNum, shortDate, longDate } from './core.js';
import { columnChart } from './column.js';
import { stackedColumns } from './stacked.js';
import { lineChart } from './line.js';
import { tileTrend } from './tile-trend.js';
import { stageTracks } from './hypnogram.js';
import { progressRing } from './ring.js';
import { routeMap } from './route-map.js';
import { legend } from './legend.js';
import { sleepSchedule } from './schedule.js';

export const Charts = {
  columnChart, stackedColumns, lineChart, tileTrend, stageTracks, progressRing, routeMap, legend, sleepSchedule,
  emptyNote, compact, fmtNum, shortDate, longDate,
};
