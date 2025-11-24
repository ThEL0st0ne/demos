import Link from 'next/link'

import ChatbotInterface from '@/app/components/ChatbotInterface';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ChatbotInterface />
    </div>
  );
}

