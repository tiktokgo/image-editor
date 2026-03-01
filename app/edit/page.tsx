import ImageEditor from "@/components/ImageEditor";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EditPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const imageUrl =
    typeof params.image_url === "string" ? params.image_url : null;
  const quoteId =
    typeof params.quote_id === "string" ? params.quote_id : undefined;

  if (!imageUrl) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-red-50"
        dir="rtl"
      >
        <div className="text-center p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-700 mb-2">פרמטר חסר</h1>
          <p className="text-red-600">
            יש לספק <code>image_url</code> בכתובת ה-URL.
          </p>
          <p className="text-gray-500 text-sm mt-4">
            דוגמה: /edit?image_url=https://...
          </p>
        </div>
      </div>
    );
  }

  return <ImageEditor imageUrl={imageUrl} quoteId={quoteId} />;
}
