<?php

declare(strict_types=1);

namespace Drupal\sutram\Controller;

use Drupal\Core\Controller\ControllerBase;

/**
 * The Sutram console page.
 */
final class ConsoleController extends ControllerBase {

  /**
   * Renders the console page.
   *
   * @return array<string, mixed>
   *   A render array.
   */
  public function page(): array {
    return [
      '#markup' => $this->t('The Sutram console will live here.'),
    ];
  }

}
