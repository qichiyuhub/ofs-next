// GitHub service for module sources (simplified, no validation)

export class GitHubService {
  private proxyUrl = 'https://ghproxy.imciel.com'

  /**
   * Parse GitHub repository URL to extract owner and repo
   */
  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /^git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return { owner: match[1], repo: match[2] }
      }
    }

    return null
  }

  /**
   * Download repository archive as zip through proxy
   */
  async downloadRepository(owner: string, repo: string, ref: string): Promise<Blob> {
    const downloadUrl = `${this.proxyUrl}/https://github.com/${owner}/${repo}/archive/${ref}.zip`
    const response = await fetch(downloadUrl)
    if (!response.ok) {
      throw new Error(`Failed to download repository: ${response.statusText}`)
    }
    return response.blob()
  }
}

export const githubService = new GitHubService()