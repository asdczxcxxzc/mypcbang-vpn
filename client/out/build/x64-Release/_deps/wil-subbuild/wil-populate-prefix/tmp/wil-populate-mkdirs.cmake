# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file LICENSE.rst or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION ${CMAKE_VERSION}) # this file comes with cmake

# If CMAKE_DISABLE_SOURCE_CHANGES is set to true and the source directory is an
# existing directory in our source tree, calling file(MAKE_DIRECTORY) on it
# would cause a fatal error, even though it would be a no-op.
if(NOT EXISTS "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-src")
  file(MAKE_DIRECTORY "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-src")
endif()
file(MAKE_DIRECTORY
  "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-build"
  "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix"
  "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix/tmp"
  "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix/src/wil-populate-stamp"
  "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix/src"
  "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix/src/wil-populate-stamp"
)

set(configSubDirs Debug)
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix/src/wil-populate-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "C:/Users/C1/Desktop/mypcbang_project/vpn-system/client/out/build/x64-Release/_deps/wil-subbuild/wil-populate-prefix/src/wil-populate-stamp${cfgdir}") # cfgdir has leading slash
endif()
