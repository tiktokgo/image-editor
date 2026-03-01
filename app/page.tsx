export default function Home() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-100"
      dir="rtl"
    >
      <div className="text-center p-8 bg-white rounded-xl shadow-md">
        <div className="text-5xl mb-4">🖼️</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Image Editor</h1>
        <p className="text-gray-500 text-sm">
          השתמש ב-iframe עם הפרמטר{" "}
          <code className="bg-gray-100 px-1 rounded">image_url</code>:
        </p>
        <p className="text-gray-400 text-xs mt-2">
          /edit?image_url=https://...
        </p>
      </div>
    </div>
  );
}
