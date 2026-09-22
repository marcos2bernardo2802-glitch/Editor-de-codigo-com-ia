import { ProjectFile } from '../types';
import { normalizeFilePath, extractFileNameFromPath } from './workspace';

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  file?: ProjectFile;
  children?: FileTreeNode[];
}

/**
 * Builds a nested tree structure from a flat array of ProjectFile[],
 * sorting folders first, then files alphabetically.
 */
export function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const rootNodes: FileTreeNode[] = [];
  const folderMap = new Map<string, FileTreeNode>();

  // Ensure root folder entries exist
  const getOrCreateFolder = (folderPath: string): FileTreeNode => {
    const normalized = normalizeFilePath(folderPath);
    if (folderMap.has(normalized)) {
      return folderMap.get(normalized)!;
    }

    const segments = normalized.split('/');
    const folderName = segments[segments.length - 1];

    const folderNode: FileTreeNode = {
      id: `folder-${normalized}`,
      name: folderName,
      path: normalized,
      isFolder: true,
      children: [],
    };

    folderMap.set(normalized, folderNode);

    if (segments.length === 1) {
      // Direct child of root
      rootNodes.push(folderNode);
    } else {
      // Child of parent folder
      const parentPath = segments.slice(0, -1).join('/');
      const parentNode = getOrCreateFolder(parentPath);
      parentNode.children = parentNode.children || [];
      parentNode.children.push(folderNode);
    }

    return folderNode;
  };

  // Insert all files into tree
  for (const file of files) {
    const normPath = normalizeFilePath(file.path || file.name);
    const segments = normPath.split('/');

    if (segments.length === 1) {
      // File at root
      rootNodes.push({
        id: file.id,
        name: file.name || segments[0],
        path: normPath,
        isFolder: false,
        file,
      });
    } else {
      const folderPath = segments.slice(0, -1).join('/');
      const parentFolder = getOrCreateFolder(folderPath);
      parentFolder.children = parentFolder.children || [];
      parentFolder.children.push({
        id: file.id,
        name: file.name || segments[segments.length - 1],
        path: normPath,
        isFolder: false,
        file,
      });
    }
  }

  // Sort function: Folders first (A-Z), then Files (A-Z)
  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    for (const node of nodes) {
      if (node.isFolder && node.children) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(rootNodes);
  return rootNodes;
}
