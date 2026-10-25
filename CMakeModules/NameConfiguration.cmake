set(MAIN_TARGET JellyfinDesktop)

# Name of the output binary and data directories
set(MAIN_NAME wallaby-popcorn)
set(DATA_NAME wallaby-popcorn)

if(APPLE)
  set(MAIN_NAME "Wallaby Popcorn")
  set(DATA_NAME "Wallaby Popcorn")
elseif(WIN32)
  set(MAIN_NAME "Wallaby Popcorn")
  set(DATA_NAME "Wallaby Popcorn")
endif(APPLE)

configure_file(src/shared/Names.cpp.in src/shared/Names.cpp @ONLY)