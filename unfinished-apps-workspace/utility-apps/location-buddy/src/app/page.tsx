export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            LocationBuddy
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Your personal location tracking companion. Discover, save, and organize your favorite places with ease.
          </p>
        </div>
        
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-800">Features</h2>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                    Save and organize your favorite locations
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                    Interactive map integration
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                    Location-based reminders
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                    Share locations with friends
                  </li>
                </ul>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <span className="text-white text-3xl">📍</span>
                  </div>
                  <p className="text-gray-600">Map view coming soon!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}