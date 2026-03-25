import React from 'react';
import { Line } from 'react-chartjs-2';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface DashboardChartProps {
  data: number[];
  labels: string[];
  label: string;
}

const DashboardChart: React.FC<DashboardChartProps> = ({ data, labels, label }) => {
  return (
    <div className="dashboard-chart">
      <Line
        data={{
          labels,
          datasets: [
            {
              label,
              data,
              borderColor: '#7c5cff',
              backgroundColor: 'rgba(124,92,255,0.15)',
              tension: 0.35,
              pointRadius: 2.5,
              borderWidth: 2,
              fill: true,
            },
          ],
        }}
        options={{
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#bcbcff' },
            },
            y: {
              grid: { color: 'rgba(124,92,255,0.08)' },
              ticks: { color: '#bcbcff' },
            },
          },
        }}
      />
    </div>
  );
};

export default DashboardChart;
