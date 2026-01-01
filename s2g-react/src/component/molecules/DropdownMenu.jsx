import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";

export function DropdownMenu({ trigger, items, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Use fixed position based on viewport (not scroll)
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 200,
      });
    }
  }, [isOpen]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleItemClick = (onClick) => {
    if (onClick) onClick();
    setIsOpen(false);
  };

  return (
    <>
      <div ref={triggerRef} onClick={handleToggle} className={className}>
        {trigger}
      </div>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            className="fixed Glassmorphgisme-noHover z-[9999] rounded-xl shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              minWidth: "200px",
            }}
          >
            <ul className="py-2 text-white">
              {items.map((item, index) => (
                <li
                  key={index}
                  onClick={() => handleItemClick(item.onClick)}
                  className={`
                    block w-full text-left cursor-pointer 
                    px-5 py-2.5 
                    hover:bg-white/10 
                    text-sm
                    ${item.danger ? "text-red-400" : ""}
                    ${
                      index !== items.length - 1
                        ? "border-b border-white/20"
                        : ""
                    }
                  `}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
