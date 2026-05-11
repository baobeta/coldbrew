interface IconPath {
  d: string
  stroke?: string
  strokeWidth?: string
  fill?: string
  strokeLinecap?: string
  strokeLinejoin?: string
}

export const icons: Record<string, IconPath[]> = {
  chevron: [
    { d: 'M6 4l4 4-4 4', strokeWidth: '1.5', strokeLinecap: 'round' },
  ],
  file: [
    { d: 'M4.5 1.5h5l3 3v9.5h-8z', stroke: '#94a3b8', fill: '#f1f5f9' },
    { d: 'M9.5 1.5v3h3', stroke: '#94a3b8' },
    { d: 'M6 7.5h4M6 9.5h3', stroke: '#94a3b8', strokeWidth: '1', strokeLinecap: 'round' },
  ],
  'file-plus': [
    { d: 'M4.5 1.5h5l3 3v9.5h-8z' },
    { d: 'M9.5 1.5v3h3' },
    { d: 'M7 8v3M5.5 9.5h3', strokeWidth: '1.5', strokeLinecap: 'round' },
  ],
  folder: [
    { d: 'M1.5 3.5h4l1.5 1.5h7.5v8h-13z', stroke: '#d4a843', fill: '#fde68a' },
  ],
  'folder-open': [
    { d: 'M1.5 3.5h4l1.5 1.5h7.5v8h-13z', stroke: '#e8a848', fill: '#fef3c7' },
    { d: 'M1.5 5h13', stroke: '#e8a848', strokeWidth: '1' },
  ],
  'folder-plus': [
    { d: 'M1.5 3.5h4l1.5 1.5h7.5v8h-13z' },
    { d: 'M7 8v3M5.5 9.5h3', strokeWidth: '1.5', strokeLinecap: 'round' },
  ],
  mic: [
    { d: 'M8 1.5a2 2 0 012 2v4a2 2 0 01-4 0v-4a2 2 0 012-2z', fill: 'currentColor' },
    { d: 'M4 7.5a4 4 0 008 0M8 11.5v3M6 14.5h4', strokeWidth: '1.3', strokeLinecap: 'round' },
  ],
  'mic-small': [
    { d: 'M8 1.5a2 2 0 012 2v4a2 2 0 01-4 0v-4a2 2 0 012-2z', fill: 'currentColor' },
    { d: 'M4 7.5a4 4 0 008 0M8 11.5v3', strokeWidth: '1.5', strokeLinecap: 'round' },
  ],
  pencil: [
    { d: 'M11.5 2.5l2 2-8 8H3.5v-2z' },
  ],
  trash: [
    { d: 'M3 4.5h10M5.5 4.5V3.5h5v1M5.5 4.5v8h5v-8' },
  ],
}
