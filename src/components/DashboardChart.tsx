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
              borderColor: '#79c0ff',
              backgroundColor: 'rgba(121,192,255,0.18)',
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
              ticks: { color: '#9ba4c3' },
            },
            y: {
              grid: { color: 'rgba(121,192,255,0.12)' },
              ticks: { color: '#9ba4c3' },
            },
          },
        }}
      />
    </div>
  );
};

export default DashboardChart;
