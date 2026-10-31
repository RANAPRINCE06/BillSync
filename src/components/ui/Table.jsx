import { Loader2 } from 'lucide-react';

export function Table({ children, className = '' }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

export function TableHead({ children }) {
  return (
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className = '' }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function Td({ children, className = '' }) {
  return (
    <td className={`px-4 py-3 text-slate-700 ${className}`}>{children}</td>
  );
}

export function TableSkeleton({ cols = 5, rows = 5 }) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <Td key={j}>
              <div className="h-4 bg-slate-200 rounded animate-pulse" />
            </Td>
          ))}
        </tr>
      ))}
    </TableBody>
  );
}

export function TableEmpty({ message = 'No records found', cols = 5 }) {
  return (
    <TableBody>
      <tr>
        <td colSpan={cols} className="px-4 py-12 text-center text-slate-400 text-sm">
          {message}
        </td>
      </tr>
    </TableBody>
  );
}

