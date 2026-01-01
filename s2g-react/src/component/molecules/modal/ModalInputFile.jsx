import React, { useEffect, useState, forwardRef } from "react";

export const ModalInputFile = forwardRef((props, ref) => {
  const { onChange, label, for: id, name, initialUrl } = props;
  const [preview, setPreview] = useState(initialUrl || null);

  useEffect(() => {
    setPreview(initialUrl || null);
  }, [initialUrl]);

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(initialUrl || null);
    }
    if (onChange) onChange(file);
  };

  return (
    <div className="mt-3">
      <label className="block" htmlFor={id}>
        {label}
      </label>
      <div className="mt-2 flex items-center gap-4">
        <input
          className="block w-full rounded-xl bg-transparent border-white border outline outline-1 placeholder:text-white focus:outline-indigo-600 sm:text-sm file:px-2 file:py-1 file:bg-white/30 file:border-transparent file:text-white file:hover:file:bg-white/50 file:rounded-s-xl file:me-3"
          type="file"
          id={id}
          name={name || id}
          onChange={handleChange}
          ref={ref}
          accept="image/*"
        />
        {preview && (
          <img
            src={preview}
            alt="preview"
            style={{
              width: 64,
              height: 64,
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        )}
      </div>
    </div>
  );
});
