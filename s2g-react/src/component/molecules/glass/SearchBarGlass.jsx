import React, { useState, useRef, useEffect } from "react";

export function SearchBarGlass({ onSearch, projectId, debounceMs = 300 }) {
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const handleChange = (event) => {
    const value = event.target.value;
    setSearchTerm(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value, projectId);
    }, debounceMs);
  };

  // Keep submit for accessibility / explicit search
  const handleSubmit = (event) => {
    event.preventDefault();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onSearch(searchTerm, projectId);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex justify-center">
        <div className="relative">
          <input
            ref={inputRef}
            className="sm:w-[500px] w-72 mx-auto rounded-full bg-white/30 px-3 py-1.5 text-base border-white border text-white placeholder:text-white/70 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-indigo-600 sm:text-sm/6"
            type="text"
            id="search-bar"
            name="search-bar"
            placeholder="Search bar..."
            value={searchTerm}
            onChange={handleChange}
          />
          <button type="submit">
            <img
              className="absolute top-[5px] right-[5px] bg-white/30 rounded-full px-3 py-1.5"
              src="/img/icon/search.svg"
              alt="Search-icon"
            />
          </button>
        </div>
      </div>
    </form>
  );
}
