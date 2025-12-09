'use client';

import { useState, useEffect } from 'react';

interface AnimatedTextProps {
  texts: string[];
  interval?: number;
  className?: string;
}

export default function AnimatedText({ 
  texts, 
  interval = 2500, 
  className = "" 
}: AnimatedTextProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (texts.length <= 1) return;
    
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, interval);
    
    return () => clearInterval(timer);
  }, [texts.length, interval]);

  if (texts.length === 0) return null;
  if (texts.length === 1) return <span className={className}>{texts[0]}</span>;

  return (
    <span className="inline-block">
      <span 
        key={currentIndex}
        className={`inline-block animate-fadeInUp ${className}`}
      >
        {texts[currentIndex]}
      </span>
      <style jsx>{`
        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out forwards;
        }
      `}</style>
    </span>
  );
}